-- ============================================================
-- Een nieuw account mag pas vooruit plannen (scheduled, niet-asap) bij
-- een specifiek gekozen barber zodra er al een afgeronde boeking met
-- die barber bestaat. Zonder die geschiedenis is de enige weg om aan een
-- barber te komen een broadcast/auto-match-aanvraag (p_barber_id null)
-- of een directe "Nu"-aanvraag (asap) — dat gebeurt live, dus de barber
-- ziet/bevestigt de aanvraag op het moment zelf, in tegenstelling tot een
-- vooraf vastgelegde afspraak met een wildvreemde.
-- Client-side gefilterd in klant/barbers ("Boek vooruit"-tab, zie
-- getCompletedBarberIdsForCustomer in queries.ts) — deze migratie is de
-- server-side spiegeling daarvan (regel 20 CLAUDE.md: een UI-filter is
-- geen beveiliging, dezelfde regel hoort ook in de RPC zelf).
-- `create or replace function` vervangt de hele body (regel 22 CLAUDE.md)
-- — dit is de volledige 0027-body met alleen de nieuwe check toegevoegd.
-- ============================================================

create or replace function public.create_booking_with_services(
  p_barber_id uuid,
  p_address text,
  p_note text,
  p_requested_asap boolean,
  p_scheduled_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := auth.uid();
  v_booking_id uuid;
  v_line jsonb;
  v_service_id uuid;
  v_quantity smallint;
  v_service record;
  v_total_price integer := 0;
  v_total_duration integer := 0;
  v_summary text := '';
  v_has_history boolean;
begin
  if v_customer_id is null then
    raise exception 'Niet ingelogd';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Minstens één dienst is verplicht';
  end if;

  if p_barber_id is not null and not p_requested_asap then
    select exists(
      select 1 from public.bookings
      where customer_id = v_customer_id
        and barber_id = p_barber_id
        and status = 'completed'
    ) into v_has_history;
    if not v_has_history then
      raise exception 'Je kunt pas vooruit plannen bij deze barber zodra je al een afgeronde afspraak met diegene hebt gehad. Maak eerst een aanvraag in de buurt aan.';
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_service_id := (v_line ->> 'service_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::smallint;
    if v_quantity is null or v_quantity < 1 or v_quantity > 6 then
      raise exception 'Ongeldig aantal voor een dienst';
    end if;

    select id, barber_id, name, price_cents, duration_minutes
    into v_service
    from public.services
    where id = v_service_id and active;

    if v_service is null then
      raise exception 'Ongeldige of niet-actieve dienst';
    end if;
    if p_barber_id is not null and v_service.barber_id is distinct from p_barber_id then
      raise exception 'Deze dienst hoort niet bij de opgegeven barber';
    end if;

    v_total_price := v_total_price + v_service.price_cents * v_quantity;
    v_total_duration := v_total_duration + v_service.duration_minutes * v_quantity;
    v_summary := v_summary || case when v_summary = '' then '' else ', ' end ||
      case when v_quantity > 1 then v_quantity || 'x ' else '' end || v_service.name;
  end loop;

  insert into public.bookings (
    customer_id, barber_id, address, note, requested_asap, scheduled_at, lat, lng,
    service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot
  ) values (
    v_customer_id, p_barber_id, p_address, p_note, p_requested_asap, p_scheduled_at, p_lat, p_lng,
    v_summary, v_total_price, v_total_duration
  )
  returning id into v_booking_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_service_id := (v_line ->> 'service_id')::uuid;
    v_quantity := (v_line ->> 'quantity')::smallint;

    select id, name, price_cents, duration_minutes into v_service
    from public.services where id = v_service_id;

    insert into public.booking_services (
      booking_id, service_id, service_name_snapshot, quantity,
      unit_price_cents_snapshot, unit_duration_minutes_snapshot
    ) values (
      v_booking_id, v_service.id, v_service.name, v_quantity,
      v_service.price_cents, v_service.duration_minutes
    );
  end loop;

  return v_booking_id;
end;
$$;

comment on function public.create_booking_with_services(uuid, text, text, boolean, timestamptz, double precision, double precision, jsonb) is
  'Enige geldige weg om een boeking aan te maken sinds 0027 (bookings heeft geen insert-grant meer voor authenticated). p_lines: [{"service_id": "...", "quantity": 1-6}, ...] — elke regel wordt gevalideerd tegen de echte services-tabel (bestaat, actief, hoort bij p_barber_id indien die gezet is), price/duration/service_name_snapshot worden hier berekend, nooit vertrouwd van de client. Sinds 0029: een scheduled (niet-asap) boeking bij een specifieke p_barber_id vereist een eerder afgeronde boeking met diezelfde barber — broadcast (p_barber_id null) en asap-aanvragen zijn hiervan uitgezonderd.';
