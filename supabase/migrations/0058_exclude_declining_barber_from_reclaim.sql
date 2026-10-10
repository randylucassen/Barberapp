-- Gevraagd door de gebruiker (2026-10-10): bij een open_request-
-- aanvraag (0042/0043) mag een barber die een prijs heeft voorgesteld
-- en vervolgens door de klant is afgewezen (decline_price_and_reopen),
-- niet nog een keer hetzelfde aanbod bij diezelfde klant indienen. Dit
-- stond in het oorspronkelijke plan bewust NOG buiten scope ("bewust
-- simpel gehouden voor een eerste versie") — nu alsnog gebouwd, op
-- expliciet verzoek.
--
-- Een pure timeout (de klant reageert gewoon niet binnen 30 minuten,
-- afgehandeld door /api/cron/expire-price-pending-requests) is GEEN
-- weigering van de prijs en telt dus niet mee — alleen een bewuste
-- "Weiger, zoek een andere barber"-actie van de klant via
-- decline_price_and_reopen() sluit die ene barber uit, voor de rest
-- van de geldigheidsduur (1 uur) van deze specifieke aanvraag.

alter table public.bookings
  add column declined_barber_ids uuid[] not null default '{}';

comment on column public.bookings.declined_barber_ids is
  'Barbers wiens voorgestelde prijs de klant al heeft afgewezen op deze open_request-aanvraag (decline_price_and_reopen, 0058) — uitgesloten van opnieuw claimen zolang deze aanvraag loopt. Niet gezet bij een timeout-reopen (cron), alleen bij een bewuste klant-weigering.';

-- ============================================================
-- decline_price_and_reopen (laatst 0043) — volledige body opnieuw,
-- voegt de huidige barber_id toe aan declined_barber_ids vóórdat 'm
-- wordt teruggezet naar null.
-- ============================================================
create or replace function public.decline_price_and_reopen(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  delete from public.booking_services
  where booking_id = p_booking_id
    and booking_id in (
      select id from public.bookings
      where id = p_booking_id and customer_id = auth.uid() and status = 'price_pending'
    );

  update public.bookings set
    declined_barber_ids = array_append(declined_barber_ids, barber_id),
    barber_id = null,
    status = 'requested',
    price_cents_snapshot = null,
    duration_minutes_snapshot = null,
    price_confirm_due_at = null
  where id = p_booking_id and customer_id = auth.uid() and status = 'price_pending';

  if not found then
    raise exception 'Deze aanvraag staat niet (meer) open om te weigeren';
  end if;
end;
$$;

comment on function public.decline_price_and_reopen(uuid) is
  'Klant weigert de door een barber voorgestelde prijs op een open_request-aanvraag — maakt de claim ongedaan (barber_id/prijs/booking_services terug naar niets) zodat de aanvraag weer zichtbaar/claimbaar wordt voor een ANDERE barber, binnen de oorspronkelijke 1-uurs-geldigheid vanaf created_at. Sinds 0058: de weigerende barber zelf wordt aan declined_barber_ids toegevoegd en kan deze specifieke aanvraag niet nog eens claimen. Een cron-timeout (/api/cron/expire-price-pending-requests) doet bewust dezelfde reset zonder deze toevoeging — dat is geen actieve weigering.';

-- ============================================================
-- claim_open_broadcast_request (laatst 0044) — volledige body
-- opnieuw, met een extra guard: eerder al gedeclineerd door deze
-- barber -> niet opnieuw claimbaar.
-- ============================================================
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
  v_declined_barber_ids uuid[];
  v_claimed_id uuid;
begin
  if v_barber_id is null then
    raise exception 'Niet ingelogd';
  end if;

  select requested_services, lat, lng, declined_barber_ids
  into v_lines, v_lat, v_lng, v_declined_barber_ids
  from public.bookings
  where id = p_booking_id and barber_id is null and status = 'requested' and open_request;

  if v_lines is null then
    raise exception 'Deze aanvraag is niet (meer) beschikbaar om te claimen';
  end if;

  -- Expliciete herhaling van de RLS-voorwaarden — zie de migratie-
  -- header van 0044 voor waarom dit niet overgeslagen mag worden.
  if not public.barber_is_online_and_available(v_barber_id) then
    raise exception 'Je bent nu niet beschikbaar om aanvragen te claimen';
  end if;
  if v_lat is null or v_lng is null or not public.barber_matches_location_and_service(v_lat, v_lng, p_booking_id) then
    raise exception 'Deze aanvraag is niet (meer) beschikbaar om te claimen';
  end if;
  if v_barber_id = any(v_declined_barber_ids) then
    raise exception 'De klant heeft jouw prijs voor deze aanvraag al afgewezen';
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
    and not (v_barber_id = any(declined_barber_ids))
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
  'Claimt een open_request-aanvraag (zie create_open_broadcast_request) tegen de EIGEN prijzen van de claimende barber — zet status naar price_pending (niet accepted) met een 30-minuten price_confirm_due_at, zodat de klant de zojuist bepaalde prijs nog moet bevestigen. Herhaalt expliciet barber_is_online_and_available() + barber_matches_location_and_service() (SECURITY DEFINER query''t buiten RLS om, zie 0044) vóór het claimen, plus sinds 0058 een check dat deze barber niet al eerder door de klant is afgewezen op deze aanvraag (declined_barber_ids). Daarna atomisch gated op barber_id is null and status=requested and niet-gedeclineerd.';

-- ============================================================
-- RLS: een barber die al gedeclineerd is op deze aanvraag mag 'm niet
-- meer zien of claimen. Beide policies (laatst 0043) volledig
-- opnieuw met de extra voorwaarde.
-- ============================================================
drop policy "Barbers can view open, pending-payment, or no-price requests within radius" on public.bookings;
create policy "Barbers can view open, pending-payment, or no-price, non-declined requests within radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap or bookings.open_request)
    and not (auth.uid() = any(bookings.declined_barber_ids))
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  );

drop policy "Barbers can claim open, pending-payment, or no-price requests within radius" on public.bookings;
create policy "Barbers can claim open, pending-payment, or no-price, non-declined requests within radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap or bookings.open_request)
    and not (auth.uid() = any(bookings.declined_barber_ids))
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  )
  with check (barber_id = auth.uid());
