-- Live geverifieerd na het pushen van 0042/0043 (zie CLAUDE.md) en een
-- echte gat gevonden: claim_open_broadcast_request() draait als
-- SECURITY DEFINER en query't/update't bookings dus BUITEN RLS om. De
-- comment in 0043 nam ten onrechte aan dat "de select zelf de poort
-- is" (verwijzend naar de RLS-select-policy) — dat klopt alleen voor
-- een gewone client-query als de aanroepende rol, niet voor de interne
-- queries van een SECURITY DEFINER-functie (die lopen als de
-- functie-eigenaar, die RLS niet ziet). Live getest: een offline
-- barber zonder enige match (geen lat/lng-overlap) kon zo alsnog elke
-- open aanvraag claimen — de locatie/dienst-match en de online-check
-- werden allebei overgeslagen.
--
-- Fix: dezelfde twee voorwaarden die de RLS-update-policy "Barbers can
-- claim open, pending-payment, or no-price requests within radius"
-- (0043) voor de NIET-broadcast-claimweg afdwingt, nu ook expliciet
-- herhaald binnen de functie zelf, vóór er iets wordt gewijzigd.
create or replace function public.claim_open_broadcast_request(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barber_id uuid := auth.uid();
  v_line jsonb;
  v_name text;
  v_quantity smallint;
  v_service record;
  v_total_price integer := 0;
  v_total_duration integer := 0;
  v_lines jsonb;
  v_lat double precision;
  v_lng double precision;
  v_claimed_id uuid;
begin
  if v_barber_id is null then
    raise exception 'Niet ingelogd';
  end if;

  select requested_services, lat, lng into v_lines, v_lat, v_lng
  from public.bookings
  where id = p_booking_id and barber_id is null and status = 'requested' and open_request;

  if v_lines is null then
    raise exception 'Deze aanvraag is niet (meer) beschikbaar om te claimen';
  end if;

  -- Expliciete herhaling van de RLS-voorwaarden — zie de migratie-
  -- header hierboven voor waarom dit niet overgeslagen mag worden.
  if not public.barber_is_online_and_available(v_barber_id) then
    raise exception 'Je bent nu niet beschikbaar om aanvragen te claimen';
  end if;
  if v_lat is null or v_lng is null or not public.barber_matches_location_and_service(v_lat, v_lng, p_booking_id) then
    raise exception 'Deze aanvraag is niet (meer) beschikbaar om te claimen';
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_name := v_line ->> 'name';
    v_quantity := (v_line ->> 'quantity')::smallint;

    select id, name, price_cents, duration_minutes
    into v_service
    from public.services
    where barber_id = v_barber_id and name = v_name and active;

    if v_service is null then
      raise exception 'Je biedt niet (meer) alle gevraagde diensten aan';
    end if;

    v_total_price := v_total_price + v_service.price_cents * v_quantity;
    v_total_duration := v_total_duration + v_service.duration_minutes * v_quantity;
  end loop;

  update public.bookings set
    barber_id = v_barber_id,
    status = 'price_pending',
    price_confirm_due_at = now() + interval '30 minutes',
    price_cents_snapshot = v_total_price,
    duration_minutes_snapshot = v_total_duration
  where id = p_booking_id and barber_id is null and status = 'requested' and open_request
  returning id into v_claimed_id;

  if v_claimed_id is null then
    raise exception 'Deze aanvraag is net door een andere barber geclaimd';
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_name := v_line ->> 'name';
    v_quantity := (v_line ->> 'quantity')::smallint;

    select id, name, price_cents, duration_minutes into v_service
    from public.services where barber_id = v_barber_id and name = v_name and active;

    insert into public.booking_services (
      booking_id, service_id, service_name_snapshot, quantity,
      unit_price_cents_snapshot, unit_duration_minutes_snapshot
    ) values (
      v_claimed_id, v_service.id, v_service.name, v_quantity,
      v_service.price_cents, v_service.duration_minutes
    );
  end loop;

  return v_claimed_id;
end;
$$;

comment on function public.claim_open_broadcast_request(uuid) is
  'Claimt een open_request-aanvraag (zie create_open_broadcast_request) tegen de EIGEN prijzen van de claimende barber — zet status naar price_pending (niet accepted) met een 30-minuten price_confirm_due_at, zodat de klant de zojuist bepaalde prijs nog moet bevestigen. Herhaalt expliciet barber_is_online_and_available() + barber_matches_location_and_service() (SECURITY DEFINER query''t buiten RLS om, zie 0044) vóór het claimen, en is daarna atomisch gated op barber_id is null and status=requested.';
