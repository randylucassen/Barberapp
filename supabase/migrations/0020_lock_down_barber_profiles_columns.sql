-- Security-fix: `grant select on public.barber_profiles to authenticated`
-- (0003) had geen kolomlijst — RLS is row-level, niet column-level, dus de
-- "Approved barber profiles are viewable by authenticated users"-policy gaf
-- daarmee élke klant leestoegang tot de VOLLEDIGE rij van elke approved
-- barber, inclusief iban/kvk_number/insurance_doc_url/id_doc_url. De app
-- zelf query't nooit meer dan de veilige kolommen (via de
-- `approved_barbers`-view, zie 0005), maar de onderliggende tabel-grant liet
-- dat niet afdwingen — een rechtstreekse PostgREST-call tegen
-- `barber_profiles` omzeilde de view volledig.
--
-- Fix: dezelfde revoke-eerst-aanpak als 0006, nu met een expliciete
-- kolomlijst i.p.v. een kale `grant select` — zelfde kolommen als de
-- `approved_barbers`-view, plus `is_online` (rechtstreeks gequery't voor de
-- klant-facing barberslijst, zie `getApprovedBarbersWithServices` in
-- `queries.ts`). `lat`/`lng` blijven bewust buiten deze grant (zie het
-- commentaar bij `find_nearest_eligible_barber` in 0007 — die blijven
-- alleen bereikbaar via een security-definer-functie).
--
-- Let op: kolom-grants zijn per rol, niet per policy — "Barbers can view
-- own profile" (auth.uid() = id) matcht nog steeds voor de eigen rij, maar
-- de `authenticated`-rol krijgt daarmee nog steeds alleen de kolommen uit
-- de grant hieronder, ook voor de eigen rij. Zonder aanvullende maatregel
-- zou een barber dus zijn eigen kvk_number/iban/insurance_doc_url/
-- id_doc_url/diploma_url niet meer kunnen lezen op `/barber/profiel` en
-- `/barber/uitbetalingen`. Los daarvan op met dezelfde
-- security-definer-functie-truc als `is_approved_barber` (regel 10 in
-- CLAUDE.md): de functie zelf leest de volledige rij (definer-rechten,
-- niet onderhevig aan de kolom-grant van de aanroeper), maar filtert intern
-- op `auth.uid()`, dus geeft nooit iemand anders' rij terug.

revoke select on public.barber_profiles from authenticated;

grant select (
  id, city, work_area_km, avatar_url, bio, rating_avg, rating_count, is_online
) on public.barber_profiles to authenticated;

create function public.get_own_barber_profile()
returns setof public.barber_profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from public.barber_profiles where id = auth.uid();
$$;

comment on function public.get_own_barber_profile() is
  'Geeft de volledige eigen barber_profiles-rij terug (incl. kvk_number/iban/insurance_doc_url/id_doc_url/diploma_url) voor /barber/profiel, /barber/uitbetalingen e.d. — nodig sinds de kolom-grant hierboven die kolommen niet meer breed aan authenticated geeft. Filtert intern op auth.uid(), dus nooit bruikbaar om iemand anders'' rij op te vragen.';

grant execute on function public.get_own_barber_profile() to authenticated;
