-- Fase 10: eerste admin-functionaliteit in de app. Bewust GEEN derde
-- waarde op het bestaande user_role-enum (customer/barber) — dat enum
-- zit diep verweven in RLS-policies, ROLE_HOME/ROLE_LOGIN en
-- handle_new_user()'s registratielogica, en een admin is conceptueel
-- geen klant of barber (geen barber_status/onboarding_completed/
-- referral_code die daar toch niet op zouden slaan). In plaats daarvan
-- een eigen, kleine admin_users-tabel, met hetzelfde
-- user_metadata.role-mechanisme dat middleware.ts nu al leest voor
-- klant/barber-routing (geen nieuwe DB-round-trip nodig voor die check).

-- ============================================================
-- admin_users — geen client-toegang, alleen via service role
-- ============================================================

create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Losstaand van profiles (geen barber_status/onboarding_completed/referral_code die hier toch niet op slaan). Geen publiek registratiepad — accounts worden eenmalig via de Supabase Admin API aangemaakt, met raw_user_meta_data.role = ''admin''.';

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

-- ============================================================
-- handle_new_user() uitgebreid: een 'admin'-rol in de meegegeven
-- metadata slaat een eigen, kleine rij op en slaat de klant/barber-
-- registratielogica (user_role-cast, referral-code) volledig over.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_referrer_id uuid;
begin
  if (new.raw_user_meta_data ->> 'role') = 'admin' then
    insert into public.admin_users (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    return new;
  end if;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;

  select id into v_referrer_id
  from public.profiles
  where referral_code = upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));

  insert into public.profiles (id, role, full_name, email, phone, barber_status, referral_code, referred_by_id)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    case
      when (new.raw_user_meta_data ->> 'role') = 'barber' then 'pending'::public.barber_status
      else null
    end,
    v_code,
    v_referrer_id
  );
  return new;
end;
$$;

-- ============================================================
-- Schorsen — klanten krijgen een eigen boolean (hebben geen statuskolom
-- zoals barbers); barbers hergebruiken de al bestaande
-- barber_status = 'suspended'-waarde uit 0002_barber_status_suspended.sql
-- (destijds toegevoegd maar nooit ergens door de app gezet). Geen
-- client-update-grant — zelfde precedent als barber_status sinds 0001.
-- ============================================================

alter table public.profiles add column suspended boolean not null default false;

-- ============================================================
-- admin_action_log — logboek van elke schrijvende admin-actie.
-- Polymorf target_type/target_id (varieert per actie: profiles,
-- disputes, reviews, discount_codes), bewust geen FK omdat het doel
-- per rij een andere tabel is.
-- ============================================================

create table public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_users (id) on delete cascade,
  action text not null,
  target_type text,
  target_id uuid,
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.admin_action_log is
  'Weggeschreven door de gedeelde logAdminAction()-helper (src/lib/supabase/admin.ts), aangeroepen aan het eind van elke /api/admin/*-mutatie.';

alter table public.admin_action_log enable row level security;
revoke all on public.admin_action_log from anon, authenticated;

-- ============================================================
-- Reviews verwijderen (nieuwe admin-actie) had tot nu toe geen
-- symmetrische trigger: on_review_created (0003) houdt
-- barber_profiles.rating_avg/rating_count bij op insert, maar er
-- bestond geen after-delete-tegenhanger — een verwijderde review zou
-- de rating dus stil laten verouderen. Bewust een volledige herbereking
-- i.p.v. de insert-trigger's incrementele formule in omgekeerde vorm na
-- te bouwen (geen afrondingsdrift bij herhaald inserten/verwijderen,
-- en het aantal reviews per barber is te klein om performance-impact te
-- geven).
-- ============================================================

create function public.recompute_barber_rating_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.barber_profiles
  set
    rating_avg = (select round(avg(stars), 1) from public.reviews where barber_id = old.barber_id),
    rating_count = (select count(*) from public.reviews where barber_id = old.barber_id)
  where id = old.barber_id;
  return old;
end;
$$;

create trigger on_review_deleted
  after delete on public.reviews
  for each row execute procedure public.recompute_barber_rating_on_delete();
