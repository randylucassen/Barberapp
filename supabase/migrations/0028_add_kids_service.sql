-- "Kids" stond al als tag op klant/home (SERVICE_TAGS) maar was nooit
-- onderdeel van DEFAULT_SERVICES in barber/aanmelden — geen enkele
-- barber had 'm dus ooit echt als boekbare dienst. Daardoor gaf
-- automatisch toewijzen met "Kids" aangevinkt terecht (maar verwarrend)
-- "geen barber gevonden": find_nearest_eligible_barber() vereist dat een
-- barber ALLE gevraagde servicenamen aanbiedt (0027), en niemand bood
-- "Kids" aan. Nu ook toegevoegd aan DEFAULT_SERVICES voor nieuwe
-- aanmeldingen; deze migratie backfilt 'm voor barbers die al
-- goedgekeurd zijn en nog geen "Kids"-dienst hebben (zelfde patroon als
-- de "Knip + baard" -> "Knippen + baard"-backfill in 0022).
insert into public.services (barber_id, name, duration_minutes, price_cents, active)
select p.id, 'Kids', 20, 2000, true
from public.profiles p
where p.role = 'barber'
  and p.barber_status = 'approved'
  and not exists (
    select 1 from public.services s where s.barber_id = p.id and s.name = 'Kids'
  );
