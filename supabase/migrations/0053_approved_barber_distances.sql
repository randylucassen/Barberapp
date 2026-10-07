-- Voor de klant-facing barberslijst (/klant/barbers): exacte afstand in
-- km per barber laten zien, zonder de bewuste privacy-beslissing uit
-- 0020 te doorbreken ("lat/lng blijven bewust buiten de kolom-grant aan
-- authenticated ... alleen bereikbaar via een security-definer-functie",
-- zelfde precedent als find_nearest_eligible_barber in 0007/0027). Deze
-- functie geeft daarom nooit lat/lng terug, alleen de al-berekende
-- afstand — en dekt (anders dan find_nearest_eligible_barber) ALLE
-- approved barbers met een bekende locatie, niet gefilterd op
-- dienstnaam/online-status/work_area_km, want de lijst zelf bepaalt al
-- client-side welke rijen zichtbaar zijn.
create function public.get_approved_barber_distances(p_lat double precision, p_lng double precision)
returns table (barber_id uuid, distance_km double precision)
language sql
security definer
set search_path = public
stable
as $$
  select bp.id as barber_id, public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) as distance_km
  from public.barber_profiles bp
  join public.profiles p on p.id = bp.id
  where p.barber_status = 'approved'
    and bp.lat is not null
    and bp.lng is not null;
$$;

grant execute on function public.get_approved_barber_distances(double precision, double precision) to authenticated;
