-- Fase 2: volledig schema voor het boekingensysteem (users/barber-profiles/
-- customer-profiles bestaan al via profiles uit 0001 — dit voegt de rest
-- toe: services, bookings, payments, reviews, disputes, notifications).
-- Voer uit ná 0001_init_profiles.sql en 0002_barber_status_suspended.sql.
--
-- Scope: schema + RLS + indexes alleen. Geen UI-wiring, geen matching-
-- algoritme, geen Stripe-integratie, geen 24u-geschillen-business-logica —
-- dat hoort bij latere fases (zie PROJECT.md/CLAUDE.md).

-- ============================================================
-- Enums
-- ============================================================

create type public.booking_status as enum (
  'requested', 'accepted', 'en_route', 'arrived', 'in_progress',
  'completed', 'cancelled'
);

create type public.escrow_state as enum ('held', 'released', 'paid');

create type public.dispute_status as enum ('open', 'resolved', 'dismissed');

create type public.notification_type as enum (
  'new_request', 'accepted', 'en_route', 'arrived', 'payment_received',
  'review_reminder', 'dispute'
);

-- ============================================================
-- barber_profiles / customer_profiles — 1:1-extensies op profiles
-- ============================================================

create table public.barber_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  bio text,
  kvk_number text,
  city text,
  work_area_km integer not null default 8,
  portfolio_urls text[] not null default '{}',
  insurance_doc_url text,
  id_doc_url text,
  iban text,
  rating_avg numeric(2, 1),
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.barber_profiles.rating_avg is
  'Gecachet gemiddelde, bijgewerkt door de trigger on_review_created — niet live aggregeren bij elke read.';
comment on column public.barber_profiles.portfolio_urls is
  'Storage-urls; de bucket zelf komt met Fase 3 als de upload-flow gebouwd wordt.';

create table public.customer_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  default_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_profiles is
  'Betaalmethoden staan hier bewust niet in — die worden in Fase 6 door Stripe gevaulted, nooit als ruwe data opgeslagen.';

-- ============================================================
-- services — per-barber dienstencatalogus
-- ============================================================

create table public.services (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barber_profiles (id) on delete cascade,
  name text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.services.price_cents is
  'Geldbedragen overal als integer cents, niet float, om afrondingsfouten te voorkomen.';

-- ============================================================
-- bookings
-- ============================================================

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id) on delete cascade,
  barber_id uuid references public.profiles (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  service_name_snapshot text not null,
  price_cents_snapshot integer not null check (price_cents_snapshot >= 0),
  duration_minutes_snapshot integer not null check (duration_minutes_snapshot > 0),
  address text not null,
  note text,
  requested_asap boolean not null default true,
  scheduled_at timestamptz,
  status public.booking_status not null default 'requested',
  cancelled_reason text,
  cancelled_by public.user_role,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.bookings.service_name_snapshot is
  'Snapshot van de dienst op boekingsmoment — een latere wijziging/verwijdering van services mag oude boekingen niet breken.';
comment on column public.bookings.barber_id is
  'Nullable: ondersteunt zowel "klant kiest direct een barber" (huidige mock-flow) als toewijzing via het matching-algoritme (Fase 5).';
comment on table public.bookings is
  'Statusovergangen (bv. voorkomen dat een klant zelf naar completed zet) worden nog niet afgedwongen in de database — dat hoort bij Fase 4 (Boekingen), waar de state machine echt gebouwd wordt.';

-- ============================================================
-- payments — 1:1 met bookings, uitsluitend server-side schrijfbaar
-- ============================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  platform_fee_cents integer not null check (platform_fee_cents >= 0),
  barber_payout_cents integer not null check (barber_payout_cents >= 0),
  escrow_state public.escrow_state not null default 'held',
  stripe_payment_intent_id text,
  held_at timestamptz not null default now(),
  released_at timestamptz,
  paid_out_at timestamptz
);

comment on table public.payments is
  'Geen enkel client-schrijfrecht (zie grants onderaan) — alleen een service-role/Stripe-webhook (Fase 6) mag hier ooit in schrijven.';

-- ============================================================
-- reviews — 1:1 met bookings
-- ============================================================

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  barber_id uuid not null references public.profiles (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  text text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- disputes — 1:1 met bookings
-- ============================================================

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  opened_by uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  status public.dispute_status not null default 'open',
  resolution_notes text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.disputes is
  'Het 24-uurs-geschillenvenster (wie mag openen binnen welke termijn, wat gebeurt er met escrow tijdens het geschil) is nog niet als business-logica afgedwongen — open punt voor Fase 6, zie CLAUDE.md.';
comment on column public.disputes.status is
  'Alleen server-side/admin schrijfbaar (zie grants) — de opener kan de resolutie niet zelf zetten.';

-- ============================================================
-- notifications
-- ============================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  related_booking_id uuid references public.bookings (id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Geen client-insert-recht — rijen ontstaan via backend-logica/triggers die in latere fases gebouwd worden (Fase 8).';

-- ============================================================
-- Indexes
-- ============================================================

create index bookings_customer_id_idx on public.bookings (customer_id);
create index bookings_barber_id_status_idx on public.bookings (barber_id, status);
create index services_barber_id_idx on public.services (barber_id);
create index reviews_barber_id_idx on public.reviews (barber_id);
create index notifications_user_id_read_idx on public.notifications (user_id, read);

-- ============================================================
-- Helper: laat andere tabellen "is deze barber approved?" checken zonder
-- de RLS van profiles te laten interfereren. Zonder deze functie zou een
-- policy die rechtstreeks tegen profiles subquery't altijd leeg terugkomen
-- voor rijen van iemand anders, want die subquery is zelf óók onderhevig
-- aan de "auth.uid() = id"-policy van profiles (RLS is niet "uitgeschakeld"
-- binnen een subquery). security definer omzeilt dat bewust, en geeft
-- alleen een boolean terug — nooit de onderliggende rij (dus geen lek van
-- e-mail/telefoon van andere gebruikers).
-- ============================================================

create function public.is_approved_barber(p_barber_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = p_barber_id and barber_status = 'approved'
  );
$$;

grant execute on function public.is_approved_barber(uuid) to authenticated;

-- ============================================================
-- RLS: barber_profiles
-- ============================================================

alter table public.barber_profiles enable row level security;

create policy "Barbers can view own profile"
  on public.barber_profiles for select
  using (auth.uid() = id);

create policy "Approved barber profiles are viewable by authenticated users"
  on public.barber_profiles for select
  using (public.is_approved_barber(id));

create policy "Barbers can update own profile"
  on public.barber_profiles for update
  using (auth.uid() = id);

revoke all on public.barber_profiles from anon, authenticated;
grant select on public.barber_profiles to authenticated;
grant update (
  bio, kvk_number, city, work_area_km, portfolio_urls,
  insurance_doc_url, id_doc_url, iban
) on public.barber_profiles to authenticated;

-- rating_avg/rating_count blijven bewust buiten de grant — alleen de
-- trigger (security definer) mag die bijwerken.

-- ============================================================
-- RLS: customer_profiles
-- ============================================================

alter table public.customer_profiles enable row level security;

create policy "Customers can view own profile"
  on public.customer_profiles for select
  using (auth.uid() = id);

create policy "Customers can update own profile"
  on public.customer_profiles for update
  using (auth.uid() = id);

revoke all on public.customer_profiles from anon, authenticated;
grant select on public.customer_profiles to authenticated;
grant update (default_address) on public.customer_profiles to authenticated;

-- ============================================================
-- RLS: services
-- ============================================================

alter table public.services enable row level security;

create policy "Barbers can manage own services"
  on public.services for all
  using (auth.uid() = barber_id)
  with check (auth.uid() = barber_id);

create policy "Active services of approved barbers are viewable"
  on public.services for select
  using (active and public.is_approved_barber(barber_id));

revoke all on public.services from anon, authenticated;
grant select, insert, update, delete on public.services to authenticated;

-- ============================================================
-- RLS: bookings
-- ============================================================

alter table public.bookings enable row level security;

create policy "Participants can view own bookings"
  on public.bookings for select
  using (auth.uid() = customer_id or auth.uid() = barber_id);

create policy "Customers can create own bookings"
  on public.bookings for insert
  with check (auth.uid() = customer_id);

create policy "Participants can update own bookings"
  on public.bookings for update
  using (auth.uid() = customer_id or auth.uid() = barber_id);

revoke all on public.bookings from anon, authenticated;
grant select, insert on public.bookings to authenticated;
grant update (status, cancelled_reason, cancelled_by, note, scheduled_at)
  on public.bookings to authenticated;

-- customer_id/barber_id/*_snapshot/address blijven na aanmaak vast (geen
-- update-grant) — voorkomt geknoei met financiële snapshot-velden.

-- ============================================================
-- RLS: payments
-- ============================================================

alter table public.payments enable row level security;

create policy "Participants can view own payment"
  on public.payments for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and (b.customer_id = auth.uid() or b.barber_id = auth.uid())
    )
  );

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

-- ============================================================
-- RLS: reviews
-- ============================================================

alter table public.reviews enable row level security;

create policy "Reviews are viewable by authenticated users"
  on public.reviews for select
  using (true);

create policy "Customers can review own completed bookings"
  on public.reviews for insert
  with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.customer_id = auth.uid()
        and b.status = 'completed'
    )
  );

revoke all on public.reviews from anon, authenticated;
grant select, insert on public.reviews to authenticated;

-- ============================================================
-- RLS: disputes
-- ============================================================

alter table public.disputes enable row level security;

create policy "Participants can view own dispute"
  on public.disputes for select
  using (
    auth.uid() = opened_by
    or exists (
      select 1 from public.bookings b
      where b.id = disputes.booking_id and b.barber_id = auth.uid()
    )
  );

create policy "Customers can open a dispute on own booking"
  on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and exists (
      select 1 from public.bookings b
      where b.id = disputes.booking_id and b.customer_id = auth.uid()
    )
  );

revoke all on public.disputes from anon, authenticated;
grant select, insert on public.disputes to authenticated;

-- status/resolution_notes/resolved_at: geen update-grant voor authenticated
-- — alleen server-side (service role) mag een geschil resolven.

-- ============================================================
-- RLS: notifications
-- ============================================================

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can mark own notifications as read"
  on public.notifications for update
  using (auth.uid() = user_id);

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

-- geen insert-grant: rijen ontstaan via backend-logica (Fase 8), niet via
-- de client.

-- ============================================================
-- updated_at-triggers (hergebruikt set_updated_at() uit 0001)
-- ============================================================

create trigger set_barber_profiles_updated_at
  before update on public.barber_profiles
  for each row execute procedure public.set_updated_at();

create trigger set_customer_profiles_updated_at
  before update on public.customer_profiles
  for each row execute procedure public.set_updated_at();

create trigger set_services_updated_at
  before update on public.services
  for each row execute procedure public.set_updated_at();

create trigger set_bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

create trigger set_disputes_updated_at
  before update on public.disputes
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Rating-cache: houdt barber_profiles.rating_avg/rating_count bij
-- ============================================================

create function public.update_barber_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.barber_profiles
  set
    rating_avg = round(
      (((coalesce(rating_avg, 0) * rating_count) + new.stars)::numeric / (rating_count + 1)), 1
    ),
    rating_count = rating_count + 1
  where id = new.barber_id;
  return new;
end;
$$;

create trigger on_review_created
  after insert on public.reviews
  for each row execute procedure public.update_barber_rating();

-- ============================================================
-- handle_new_user() uitbreiden: maakt nu ook de juiste extensierij aan.
-- create or replace = geen destructieve wijziging, bestaande profiles-rijen
-- blijven ongemoeid; alleen toekomstige signups krijgen het nieuwe gedrag.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  v_role := (new.raw_user_meta_data ->> 'role')::public.user_role;

  insert into public.profiles (id, role, full_name, email, phone, barber_status)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    case when v_role = 'barber' then 'pending'::public.barber_status else null end
  );

  if v_role = 'barber' then
    insert into public.barber_profiles (id) values (new.id);
  else
    insert into public.customer_profiles (id) values (new.id);
  end if;

  return new;
end;
$$;
