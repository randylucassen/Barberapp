-- Bel/Bericht-knoppen op barber/rit en klant/status waren nooit
-- functioneel (geen onClick, restant uit het designpakket). Om ze te
-- kunnen wiren naar het echte telefoonnummer van de andere partij zijn
-- twee nieuwe security-definer-functies nodig — profiles.phone is niet
-- zichtbaar voor andere gebruikers (RLS staat alleen de eigen rij toe,
-- zie regel 7 CLAUDE.md), en approved_barbers laat telefoon bewust weg
-- (0005). Zelfde patroon en scope als get_booking_customer_name (0005):
-- alleen de daadwerkelijk toegewezen tegenpartij van díe ene boeking mag
-- het nummer zien, nooit breder.

create function public.get_booking_customer_phone(p_booking_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.phone
  from public.bookings b
  join public.profiles p on p.id = b.customer_id
  where b.id = p_booking_id
    and b.barber_id = auth.uid();
$$;

comment on function public.get_booking_customer_phone(uuid) is
  'Laat een barber het telefoonnummer zien van de klant achter zijn eigen boeking — zelfde scope/patroon als get_booking_customer_name (0005), voor de Bel/Bericht-knoppen op barber/rit.';

grant execute on function public.get_booking_customer_phone(uuid) to authenticated;

create function public.get_booking_barber_phone(p_booking_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.phone
  from public.bookings b
  join public.profiles p on p.id = b.barber_id
  where b.id = p_booking_id
    and b.customer_id = auth.uid();
$$;

comment on function public.get_booking_barber_phone(uuid) is
  'Laat een klant het telefoonnummer zien van de barber achter zijn eigen boeking — spiegelbeeld van get_booking_customer_phone, voor de Bel/Bericht-knoppen op klant/status.';

grant execute on function public.get_booking_barber_phone(uuid) to authenticated;
