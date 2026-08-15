-- Live locatiekaart: de barber's live positie tijdens een rit, geschreven
-- vanaf barber/rit (navigator.geolocation.watchPosition), gelezen door de
-- klant via de al bestaande 4s-poll van getBooking() op klant/status —
-- geen Realtime, geen nieuwe network-roundtrip nodig, hergebruikt het
-- bestaande polling-patroon (de app gebruikt nergens Supabase Realtime).

alter table public.bookings
  add column barber_live_lat double precision,
  add column barber_live_lng double precision,
  add column barber_location_updated_at timestamptz;

comment on column public.bookings.barber_live_lat is
  'Live breedtegraad van de barber tijdens accepted/en_route, door de barber zelf geschreven via watchPosition. Null zolang er nog geen positie bekend is (nog niet vertrokken, of locatietoestemming geweigerd).';
comment on column public.bookings.barber_live_lng is
  'Live lengtegraad, zie barber_live_lat.';
comment on column public.bookings.barber_location_updated_at is
  'Tijdstip van de laatste live-positie-update — gebruikt door LiveMap om een verouderde/bevroren pin te herkennen (ouder dan ~2 min).';

-- Zelfde patroon als de bestaande kolom-grant in 0003 (status,
-- cancelled_reason, cancelled_by, note, scheduled_at) — een aanvullende
-- grant-statement, geen vervanging. RLS ("Participants can update own
-- bookings") staat dit al toe voor zowel klant als barber op hun eigen
-- boeking; een klant die zijn eigen weergave zou vervalsen raakt alleen
-- zijn eigen scherm, geen reëel beveiligingsrisico — bewust geen extra
-- trigger-guard.
grant update (barber_live_lat, barber_live_lng, barber_location_updated_at)
  on public.bookings to authenticated;
