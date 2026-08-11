-- Fase 6: Stripe Connect + escrow. Voegt echte betalingen toe via het
-- "separate charges and transfers"-patroon: de klant betaalt nu (geld
-- landt op het platform-Stripe-saldo, geen transfer), "vasthouden" =
-- geen transfer, "vrijgeven" = alsnog een transfer aanmaken naar de
-- connected account van de barber. Dicht ook een sequencing-gat uit
-- Fase 4/5: een boeking was al zichtbaar/claimbaar voor barbers vóórdat
-- er ooit betaald was — vanaf nu vereist barber-zichtbaarheid een
-- succesvolle betaling. Voer uit ná 0001-0007 (0008 bestaat niet, zie
-- opmerking hieronder).
--
-- Genummerd 0009 (niet 0008): 0008 zou het logische volgnummer zijn
-- geweest, maar is nooit als los bestand aangemaakt — geen gat in wat al
-- toegepast is, gewoon doorgenummerd om verwarring met een niet-bestaand
-- bestand te voorkomen.

-- ============================================================
-- Nieuwe kolommen
-- ============================================================

alter table public.barber_profiles add column stripe_account_id text;
alter table public.barber_profiles add column stripe_payouts_enabled boolean not null default false;

comment on column public.barber_profiles.stripe_account_id is
  'Stripe Connect Express-account-id. Maakt de nooit-ingevulde iban-kolom overbodig voor het echte uitbetalingspad — Stripe host de bankgegevens-onboarding zelf, wij slaan nooit een rekeningnummer op.';
comment on column public.barber_profiles.stripe_payouts_enabled is
  'Gespiegeld vanuit Stripe (account.updated-webhook). Alleen barbers met payouts_enabled=true komen in aanmerking voor de automatische escrow-vrijgave.';

grant update (stripe_account_id, stripe_payouts_enabled) on public.barber_profiles to authenticated;

-- Bewust wél een client-update-grant op deze twee kolommen: de barber
-- start zelf de Connect-onboarding vanuit de eigen sessie
-- (/api/stripe/connect-onboarding, met de klant-sessie, niet de service
-- role). De webhook (/api/stripe/webhook, service role) zet
-- stripe_payouts_enabled ook bij, maar dat gaat via de service role key
-- en omzeilt RLS toch al — de grant hierboven is voor het geval een
-- toekomstige klant-side actie deze kolommen ooit rechtstreeks zou
-- willen updaten.

alter table public.bookings add column completed_at timestamptz;

comment on column public.bookings.completed_at is
  'Gezet door check_booking_status_transition() zodra status -> completed. Ankerpunt voor het 24-uurs-geschillenvenster en de automatische escrow-vrijgave.';

alter table public.payments add column stripe_transfer_id text;
alter table public.payments add column refunded_at timestamptz;

alter type public.escrow_state add value 'refunded';

comment on column public.payments.stripe_transfer_id is
  'Stripe Transfer-id, gezet zodra escrow_state -> released (automatische vrijgave, zie /api/cron/release-escrow).';

-- ============================================================
-- check_booking_status_transition() uitbreiden: completed_at zetten
-- ============================================================

create or replace function public.check_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.barber_id is distinct from old.barber_id then
    if old.barber_id is null and new.barber_id = auth.uid()
       and old.status = 'requested' and new.status = 'accepted' then
      return new;
    end if;
    raise exception 'barber_id mag alleen gezet worden door een openstaande aanvraag te claimen';
  end if;

  if auth.uid() = old.customer_id then
    v_actor := 'customer';
  elsif auth.uid() = old.barber_id then
    v_actor := 'barber';
  else
    raise exception 'Alleen de klant of de barber van deze boeking mag de status wijzigen';
  end if;

  if v_actor = 'barber' then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'cancelled')) or
      (old.status = 'accepted' and new.status in ('en_route', 'cancelled')) or
      (old.status = 'en_route' and new.status in ('arrived', 'cancelled')) or
      (old.status = 'arrived' and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'completed')
    ) then
      raise exception 'Ongeldige statusovergang voor barber: % -> %', old.status, new.status;
    end if;
  else
    if not (
      old.status in ('requested', 'accepted', 'en_route') and new.status = 'cancelled'
    ) then
      raise exception 'Ongeldige statusovergang voor klant: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'cancelled' and new.cancelled_by is distinct from v_actor then
    raise exception 'cancelled_by moet overeenkomen met wie de boeking annuleert';
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = now();
  end if;

  return new;
end;
$$;

comment on function public.check_booking_status_transition() is
  'Statusmachine voor bookings (Fase 4/5, uitgebreid in Fase 6 met completed_at). auth.uid() is null bij een service-role-context (bv. /api/stripe/cancel-and-refund gebruikt bewust de klant/barber-sessie zelf voor de status-update, niet de service role, juist om deze validatie niet te omzeilen — zie CLAUDE.md).';

-- ============================================================
-- Barber-zichtbaarheid vereist een succesvolle betaling
-- ============================================================

-- De oorspronkelijke Fase 3-policy dekte zowel klant- als barber-
-- zichtbaarheid in één policy (auth.uid() = customer_id or barber_id).
-- Die twee hebben nu een andere eis: de klant moet de eigen boeking altijd
-- kunnen zien (ook vóór betalen, want /klant/betaling leest de boeking om
-- te kunnen betalen), de barber pas ná een succesvolle betaling. Vervangen
-- door twee losse policies i.p.v. één conditie erin proppen.

drop policy if exists "Participants can view own bookings" on public.bookings;

create policy "Customers can view own bookings"
  on public.bookings for select
  using (auth.uid() = customer_id);

create policy "Assigned barbers can view paid bookings"
  on public.bookings for select
  using (
    auth.uid() = barber_id
    and exists (select 1 from public.payments p where p.booking_id = bookings.id)
  );

drop policy if exists "Participants can update own bookings" on public.bookings;

create policy "Customers can update own bookings"
  on public.bookings for update
  using (auth.uid() = customer_id);

create policy "Assigned barbers can update paid bookings"
  on public.bookings for update
  using (
    auth.uid() = barber_id
    and exists (select 1 from public.payments p where p.booking_id = bookings.id)
  );

-- Fase 5-broadcastpolicies (0007) additief uitgebreid met dezelfde eis —
-- een barber mag een openstaande aanvraag pas zien/claimen als er
-- daadwerkelijk betaald is. Vervangt de twee policies uit 0007 volledig
-- (zelfde straal/dienst/beschikbaarheid-logica, alleen de betaal-eis
-- toegevoegd).

drop policy if exists "Barbers can view open requests within their radius" on public.bookings;

create policy "Barbers can view paid open requests within their radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and exists (select 1 from public.payments p where p.booking_id = bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and exists (
      select 1
      from public.barber_profiles bp
      join public.services s on s.barber_id = bp.id
      where bp.id = auth.uid()
        and bp.lat is not null and bp.lng is not null
        and bookings.lat is not null and bookings.lng is not null
        and s.name = bookings.service_name_snapshot
        and s.active
        and public.haversine_km(bp.lat, bp.lng, bookings.lat, bookings.lng) <= bp.work_area_km
    )
  );

drop policy if exists "Barbers can claim open requests within their radius" on public.bookings;

create policy "Barbers can claim paid open requests within their radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and exists (select 1 from public.payments p where p.booking_id = bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and exists (
      select 1
      from public.barber_profiles bp
      join public.services s on s.barber_id = bp.id
      where bp.id = auth.uid()
        and bp.lat is not null and bp.lng is not null
        and bookings.lat is not null and bookings.lng is not null
        and s.name = bookings.service_name_snapshot
        and s.active
        and public.haversine_km(bp.lat, bp.lng, bookings.lat, bookings.lng) <= bp.work_area_km
    )
  )
  with check (barber_id = auth.uid());

-- get_booking_customer_name (Fase 4) dezelfde eis toevoegen — anders kan
-- een rechtstreeks-gekozen barber via deze RPC de klantnaam opvragen vóór
-- er betaald is (de boeking zelf is dan al onzichtbaar via de
-- SELECT-policy hierboven, maar deze functie had een eigen, losstaande
-- WHERE-clause zonder die eis).

create or replace function public.get_booking_customer_name(p_booking_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.full_name
  from public.bookings b
  join public.profiles p on p.id = b.customer_id
  where b.id = p_booking_id
    and b.barber_id = auth.uid()
    and exists (select 1 from public.payments p2 where p2.booking_id = b.id);
$$;

-- ============================================================
-- Geschillenvenster: 24 uur na completed, alleen door de eigen klant
-- ============================================================

drop policy if exists "Customers can open a dispute on own booking" on public.disputes;

create policy "Customers can open a dispute within 24h of completion"
  on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and exists (
      select 1 from public.bookings b
      where b.id = disputes.booking_id
        and b.customer_id = auth.uid()
        and b.status = 'completed'
        and b.completed_at is not null
        and now() <= b.completed_at + interval '24 hours'
    )
  );

comment on policy "Customers can open a dispute within 24h of completion" on public.disputes is
  'Vervangt de losse Fase 2-policy (die geen status/tijdslimiet had). Resolutie blijft handmatig (SQL Editor + Stripe Dashboard) tot Fase 10 een adminpanel bouwt — zelfde precedent als barber_status-goedkeuring.';
