-- Regressie van 0020: de kolom-grant-lockdown op barber_profiles liet
-- `lat`/`lng` bewust weg (zie het commentaar daar — alleen bereikbaar via
-- een security-definer-functie, net als find_nearest_eligible_barber uit
-- 0007). Maar twee bestaande RLS-policies op `bookings` (0010, "Barbers
-- can view/claim paid open requests within their radius") subquery'en
-- `bp.lat`/`bp.lng` rechtstreeks, niet via een definer-functie — exact het
-- patroon uit CLAUDE.md-regel 10, alleen nu op kolomniveau i.p.v. rijniveau.
--
-- Gevolg: zodra 0020 gepusht was, faalde élke insert/select/update tegen
-- `bookings` met "permission denied for table barber_profiles" — Postgres
-- moet de policy-expressie voor élke rij kunnen evalueren (ook als de rij
-- uiteindelijk niet matcht), en de aanroepende rol (`authenticated`) had
-- simpelweg geen SELECT-recht meer op `lat`/`lng`. Dit trof niet alleen
-- barbers die aanvragen bekeken, maar ook een klant die een nieuwe
-- boeking aanmaakte (de insert doet `.select()` erna om de rij terug te
-- geven, wat dezelfde SELECT-policies evalueert) — vandaar "aanvraag bij
-- dichtstbijzijnde barber lukt niet".
--
-- Fix: dezelfde security-definer-boolean-functie-truc, nu voor deze twee
-- policies. `bookings.lat`/`lng`/`service_name_snapshot` zijn geen
-- probleem (klant/barber mogen die van hun eigen boeking al zien) — alleen
-- de `barber_profiles`-kant moet via de definer-functie, dus die krijgt de
-- boekingsvelden als parameters mee i.p.v. zelf `bookings` te bevragen.

create function public.barber_matches_location_and_service(
  p_lat double precision,
  p_lng double precision,
  p_service_name text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.barber_profiles bp
    join public.services s on s.barber_id = bp.id
    where bp.id = auth.uid()
      and bp.lat is not null and bp.lng is not null
      and p_lat is not null and p_lng is not null
      and s.name = p_service_name
      and s.active
      and public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) <= bp.work_area_km
  );
$$;

comment on function public.barber_matches_location_and_service(double precision, double precision, text) is
  'Bypass voor de kolom-grant-lockdown op barber_profiles.lat/lng (0020) — geeft alleen een boolean terug, nooit de coördinaten zelf. Gebruikt door de bookings-RLS-policies hieronder i.p.v. een rechtstreekse subquery op barber_profiles.';

grant execute on function public.barber_matches_location_and_service(double precision, double precision, text) to authenticated;

drop policy "Barbers can view paid open requests within their radius" on public.bookings;
create policy "Barbers can view paid open requests within their radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and public.booking_has_payment(bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.service_name_snapshot)
  );

drop policy "Barbers can claim paid open requests within their radius" on public.bookings;
create policy "Barbers can claim paid open requests within their radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and public.booking_has_payment(bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.service_name_snapshot)
  )
  with check (barber_id = auth.uid());
