-- Regressie gevonden tijdens live gebruik (2026-07-19), ná de pre-launch
-- audit: de `create or replace function handle_new_user()` in
-- 0016_admin_fase10.sql (Fase 10) verving de hele functiebody om de
-- nieuwe 'admin'-rol-tak toe te voegen, maar liet daarbij per ongeluk de
-- `insert into barber_profiles`/`insert into customer_profiles` weg die
-- 0003_booking_system_schema.sql daar had neergezet. Sindsdien kreeg
-- elke nieuwe klant/barber-registratie wél een `profiles`-rij, maar geen
-- bijbehorende extensierij — onopgemerkt tot een barber tijdens het
-- aanmelden een FK-fout op `services.barber_id` kreeg (die tabel
-- verwijst naar `barber_profiles.id`, dat nooit was aangemaakt).

-- ============================================================
-- FIX: handle_new_user() weer laten doen wat 0003 al deed, met de
-- 'admin'-tak uit 0016 intact.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_code text;
  v_referrer_id uuid;
begin
  if (new.raw_user_meta_data ->> 'role') = 'admin' then
    insert into public.admin_users (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    return new;
  end if;

  v_role := (new.raw_user_meta_data ->> 'role')::public.user_role;

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
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    case when v_role = 'barber' then 'pending'::public.barber_status else null end,
    v_code,
    v_referrer_id
  );

  if v_role = 'barber' then
    insert into public.barber_profiles (id) values (new.id);
  else
    insert into public.customer_profiles (id) values (new.id);
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Herstelt de barber_profiles/customer_profiles-aanmaak die per ongeluk verdween toen 0016 deze functie herschreef voor de admin-rol — zie 0018 voor de volledige toedracht.';

-- ============================================================
-- BACKFILL: elk bestaand account dat in het regressievenster
-- geregistreerd is mist nog steeds zijn extensierij — dat repareert een
-- trigger-fix niet met terugwerkende kracht. Algemene, niet aan
-- specifieke user-id's gebonden backfill, dus dit repareert iedereen die
-- hierdoor geraakt is, niet alleen de accounts die nu toevallig bekend
-- zijn.
-- ============================================================

insert into public.barber_profiles (id)
select p.id from public.profiles p
where p.role = 'barber'
  and not exists (select 1 from public.barber_profiles bp where bp.id = p.id);

insert into public.customer_profiles (id)
select p.id from public.profiles p
where p.role = 'customer'
  and not exists (select 1 from public.customer_profiles cp where cp.id = p.id);
