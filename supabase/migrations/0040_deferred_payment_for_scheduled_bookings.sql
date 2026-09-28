-- Vooruit-geplande boekingen (requested_asap = false) betalen voortaan
-- pas ná acceptatie door de barber, niet meer meteen bij het aanvragen —
-- op verzoek van de gebruiker: bij een geplande afspraak staat nog niet
-- vast of de gekozen (of, bij broadcast, een willekeurige matchende)
-- barber die wel kan, dus is het vreemd om de klant meteen te laten
-- betalen voor iets dat mogelijk wordt afgewezen. Asap-boekingen blijven
-- ongewijzigd: daar betaalt de klant nog steeds meteen, vóórdat de
-- barber de aanvraag ziet (booking_has_payment() blijft daar de
-- zichtbaarheidspoort) — bij "nu" is de tijdsdruk juist andersom: de
-- barber staat op het punt te vertrekken, dus moet het geld al vaststaan.
--
-- Nieuwe regel, ook op verzoek: een geplande boeking moet minimaal 24
-- uur van tevoren aangevraagd worden (moet sowieso passen vóór het
-- 24-uurs-betaalvenster hieronder verstrijkt). Bij acceptatie krijgt de
-- klant 24 uur om te betalen; betaalt hij niet op tijd, dan vervalt de
-- afspraak automatisch (geen kosten, er is nooit iets afgeschreven).

-- ============================================================
-- Nieuwe kolom — alleen server-side gezet (door de trigger hieronder,
-- niet door de client, zie CLAUDE.md-regel 20: geen kolom-grant nodig,
-- zelfde patroon als completed_at in dezelfde trigger).
-- ============================================================
alter table public.bookings add column payment_due_at timestamptz;

comment on column public.bookings.payment_due_at is
  'Alleen gezet voor een geaccepteerde, geplande (requested_asap=false) boeking zonder betaling — de klant heeft tot dit tijdstip om te betalen, anders vervalt de afspraak (zie /api/cron/expire-unpaid-scheduled-bookings). Null zodra er al een payments-rij bestaat of de boeking asap was.';

-- ============================================================
-- create_booking_with_services (0027, laatst gewijzigd 0029) — volledige
-- body opnieuw (CLAUDE.md-regel 22), alleen de nieuwe minimum-24u-check
-- is toegevoegd, vlak vóór de al bestaande "bekende barber"-check.
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

  if not p_requested_asap then
    if p_scheduled_at is null then
      raise exception 'Een geplande boeking moet een datum en tijd hebben';
    end if;
    if p_scheduled_at < now() + interval '24 hours' then
      raise exception 'Een vooruit geplande afspraak moet minimaal 24 uur van tevoren worden aangevraagd';
    end if;
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

-- ============================================================
-- check_booking_status_transition (laatst gewijzigd 0009) — volledige
-- body opnieuw. Nieuw: bij requested -> accepted van een geplande
-- boeking zonder bestaande betaling wordt payment_due_at gezet (+24u).
-- booking_has_payment() checken i.p.v. blind altijd zetten: een
-- geplande boeking die via de oude flow toch al vooraf betaald was
-- (of dat ooit weer wordt) hoeft geen betaaldeadline te krijgen.
-- ============================================================
create or replace function public.check_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.barber_id is distinct from old.barber_id then
    if old.barber_id is null and new.barber_id = auth.uid()
       and old.status = 'requested' and new.status = 'accepted' then
      return new;
    end if;
    raise exception 'barber_id mag alleen gezet worden door een openstaande aanvraag te claimen';
  end if;

  if auth.uid() = old.customer_id then
    v_actor := 'customer';
  elsif auth.uid() = old.barber_id then
    v_actor := 'barber';
  else
    raise exception 'Alleen de klant of de barber van deze boeking mag de status wijzigen';
  end if;

  if v_actor = 'barber' then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'cancelled')) or
      (old.status = 'accepted' and new.status in ('en_route', 'cancelled')) or
      (old.status = 'en_route' and new.status in ('arrived', 'cancelled')) or
      (old.status = 'arrived' and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'completed')
    ) then
      raise exception 'Ongeldige statusovergang voor barber: % -> %', old.status, new.status;
    end if;
  else
    if not (
      old.status in ('requested', 'accepted', 'en_route') and new.status = 'cancelled'
    ) then
      raise exception 'Ongeldige statusovergang voor klant: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'cancelled' and new.cancelled_by is distinct from v_actor then
    raise exception 'cancelled_by moet overeenkomen met wie de boeking annuleert';
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = now();
  end if;

  if new.status = 'accepted' and old.status = 'requested'
     and not new.requested_asap
     and not public.booking_has_payment(new.id) then
    new.payment_due_at = now() + interval '24 hours';
  end if;

  return new;
end;
$$;

-- ============================================================
-- notify_customer_on_status_change (laatst gewijzigd 0036) — volledige
-- body opnieuw. Nieuw: "Aanvraag bevestigd" krijgt bij een geplande,
-- nog-niet-betaalde boeking een aangepaste tekst (verwijst naar het
-- betaalvenster i.p.v. te doen alsof alles al vaststaat), plus een
-- nieuwe klant-tak voor een verlopen betaalvenster. De barber-melding
-- voor een verlopen betaalvenster komt niet hieruit maar uit
-- /api/cron/expire-unpaid-scheduled-bookings (zelfde reden als de
-- no-show-barbermelding: die route weet zelf het bedrag/de context).
-- ============================================================
create or replace function public.notify_customer_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.notification_type;
  v_title text;
  v_body text;
begin
  if new.status = 'accepted' and new.payment_due_at is not null then
    v_type := 'accepted';
    v_title := 'Aanvraag bevestigd — betaal binnen 24 uur';
    v_body := 'Je barber heeft je geplande afspraak geaccepteerd. Rond de betaling binnen 24 uur af, anders vervalt de afspraak automatisch.';
  elsif new.status = 'accepted' then
    v_type := 'accepted';
    v_title := 'Aanvraag bevestigd';
    v_body := 'Je barber heeft je aanvraag geaccepteerd.';
  elsif new.status = 'en_route' then
    v_type := 'en_route';
    v_title := 'Barber onderweg';
    v_body := 'Je barber is onderweg naar je adres.';
  elsif new.status = 'arrived' then
    v_type := 'arrived';
    v_title := 'Barber aangekomen';
    v_body := 'Je barber is aangekomen op het opgegeven adres.';
  elsif new.status = 'completed' then
    v_type := 'completed';
    v_title := 'Boeking afgerond';
    v_body := 'Je afspraak is afgerond. Laat gerust een review achter.';
  elsif new.status = 'cancelled' and new.cancelled_by = 'barber' then
    v_type := 'cancelled';
    v_title := 'Boeking geannuleerd';
    v_body := 'Je barber heeft de boeking geannuleerd. Reden: ' || coalesce(new.cancelled_reason, 'niet opgegeven') || '.';
  elsif new.status = 'cancelled' and new.cancelled_by is null and old.status = 'requested' then
    v_type := 'cancelled';
    v_title := 'Aanvraag verlopen';
    v_body := 'Niemand heeft binnen 30 minuten gereageerd op je aanvraag. Probeer het opnieuw.';
  elsif new.status = 'cancelled' and new.cancelled_by is null and old.status = 'accepted' and old.payment_due_at is not null then
    v_type := 'cancelled';
    v_title := 'Betaalvenster verlopen — afspraak vervallen';
    v_body := 'Je hebt niet binnen 24 uur na acceptatie betaald, dus is de afspraak automatisch vervallen. Er is niets in rekening gebracht.';
  elsif new.status = 'cancelled' and new.cancelled_by is null and old.status = 'accepted' then
    v_type := 'cancelled';
    v_title := 'Onze excuses — afspraak geannuleerd';
    v_body := 'Je barber heeft niet op tijd bevestigd onderweg te zijn, dus is je afspraak geannuleerd. Je krijgt het volledige bedrag (incl. servicekosten) terug.';
  end if;

  if v_type is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.customer_id, v_type, v_title, v_body, new.id);
  end if;

  -- Barber informeren als de klánt annuleert — nu ook met reden.
  if new.status = 'cancelled' and new.cancelled_by = 'customer' and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      new.barber_id,
      'cancelled',
      'Boeking geannuleerd',
      'De klant heeft de boeking geannuleerd. Reden: ' || coalesce(new.cancelled_reason, 'niet opgegeven') || '.',
      new.id
    );
  end if;

  -- Barber informeren als een directe aanvraag naar hem specifiek
  -- verloopt (systeem-timeout, geen door-de-klant-gekozen reden).
  if new.status = 'cancelled' and new.cancelled_by is null and old.status = 'requested' and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.barber_id, 'cancelled', 'Aanvraag verlopen', 'Je hebt niet binnen 30 minuten gereageerd — de aanvraag is automatisch geannuleerd.', new.id);
  end if;

  return new;
end;
$$;

-- ============================================================
-- Barber-zichtbaarheid: een geplande (requested_asap = false) boeking
-- zonder betaling mag de toegewezen/matchende barber nu ook zien/
-- accepteren, niet meer alleen ná betaling — de betaal-gate blijft wél
-- onverkort gelden voor asap-boekingen (ongewijzigd daar).
-- ============================================================
drop policy "Assigned barbers can view paid bookings" on public.bookings;
create policy "Assigned barbers can view paid or pending-payment bookings"
  on public.bookings for select
  using (
    auth.uid() = barber_id
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap)
  );

drop policy "Assigned barbers can update paid bookings" on public.bookings;
create policy "Assigned barbers can update paid or pending-payment bookings"
  on public.bookings for update
  using (
    auth.uid() = barber_id
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap)
  );

drop policy "Barbers can view paid open requests within their radius" on public.bookings;
create policy "Barbers can view open or pending-payment requests within their radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  );

drop policy "Barbers can claim paid open requests within their radius" on public.bookings;
create policy "Barbers can claim open or pending-payment requests within their radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  )
  with check (barber_id = auth.uid());

-- ============================================================
-- pg_cron-trigger — zelfde opzet als trigger_expire_noshow_bookings
-- (0035)/trigger_expire_stale_requests (0019). Geen refund nodig (er is
-- nooit iets afgeschreven voor een nog-onbetaalde boeking).
-- ============================================================
create function public.trigger_expire_unpaid_scheduled_bookings()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_config where key = 'api_base_url';
  select value into v_secret from public.app_config where key = 'cron_secret';

  if v_url is null or v_url like 'VUL-HIER%' or v_secret like 'VUL-HIER%' then
    raise notice 'Expire-unpaid-scheduled-bookings overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/expire-unpaid-scheduled-bookings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_expire_unpaid_scheduled_bookings() is
  'Wrapper rond net.http_post() naar /api/cron/expire-unpaid-scheduled-bookings — handmatig te testen met `select public.trigger_expire_unpaid_scheduled_bookings();` in de SQL Editor.';

-- Elke 5 minuten, zelfde cadans als de andere tijd-gebaseerde crons —
-- ruim genoeg voor een venster van 24 uur.
select cron.schedule('expire-unpaid-scheduled-bookings-job', '*/5 * * * *', 'select public.trigger_expire_unpaid_scheduled_bookings();');
