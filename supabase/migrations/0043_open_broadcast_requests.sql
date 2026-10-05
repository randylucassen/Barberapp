-- Automatisch toewijzen blokkeerde tot nu toe volledig zodra
-- find_nearest_eligible_barber() niemand vond (nul online/in de buurt) —
-- de klant kon dan helemaal geen aanvraag versturen. Met de gebruiker
-- afgestemd: een ASAP-aanvraag bij automatisch toewijzen moet altijd
-- verstuurbaar zijn, 1 uur geldig blijven, en zodra een barber 'm
-- claimt (nu, of pas zodra hij later online komt — dat laatste werkt al
-- via de bestaande live-RLS-poll, zie barber_matches_location_and_service
-- hieronder) gebruikt die barber zíjn eigen prijzen (zie 0041: barbers
-- bepalen sinds kort hun eigen prijs per dienst). Dat betekent dat de
-- prijs bij het versturen nog niet bekend kan zijn — de klant moet 'm
-- dus ná het claimen alsnog bevestigen, met 30 minuten de tijd.
--
-- Bewust beperkt tot ASAP: "plan vooruit" zonder match blijft
-- geblokkeerd zoals nu (met de gebruiker afgestemd, apart gesprek als
-- dat ook moet veranderen) — de tijdsvensters hieronder (1 uur/30
-- minuten) horen bij een spoedaanvraag, niet bij een over-een-week-
-- geplande afspraak.
--
-- Nieuwe statuswaarde i.p.v. 'accepted' hergebruiken: 'accepted' zit in
-- ACTIVE_RIDE_STATUSES op het barber-dashboard (isRideDue() zou een
-- asap-boeking met status 'accepted' altijd als "nu rijden"-klaar
-- beschouwen) — hergebruik zou een barber dus kunnen laten denken dat
-- hij al moet vertrekken vóórdat de klant heeft bevestigd. Een nieuwe
-- enum-waarde dwingt bovendien elke Record<BookingStatus, ...>-plek in
-- de TypeScript-code tot een compile-fout totdat 'm expliciet is
-- afgehandeld. Zelfde aanpak als eerder succesvol gebruikt op
-- notification_type (0014/0017/0032/0034) en barber_status/escrow_state.

-- De 'alter type ... add value' zelf staat in een eigen voorafgaande
-- migratie (0042_price_pending_enum_value.sql), niet hier: Postgres
-- staat niet toe dat een zojuist toegevoegde enum-waarde in dezelfde
-- transactie nog gebruikt wordt door een 'language sql'-functie (de
-- planner valideert die direct bij create function, in tegenstelling
-- tot 'language plpgsql', dat de body pas bij de eerste aanroep leest)
-- — hier gebeurt dat in barber_is_online_and_available() hieronder.
-- Zonder de enum-waarde al gecommit te hebben faalt `supabase db push`
-- met "unsafe use of new value ... in the same transaction" (SQLSTATE
-- 55P04).

-- ============================================================
-- Nieuwe kolommen op bookings
-- ============================================================

-- Een open-aanvraag heeft bij het versturen nog geen gematchte barber om
-- een prijs aan te ontlenen — deze twee kolommen moeten dus nullable
-- worden (check-constraints >=0/>0 blijven, slaan niet aan op null).
alter table public.bookings
  alter column price_cents_snapshot drop not null,
  alter column duration_minutes_snapshot drop not null;

alter table public.bookings add column open_request boolean not null default false;
alter table public.bookings add column requested_services jsonb;
alter table public.bookings add column price_confirm_due_at timestamptz;

comment on column public.bookings.open_request is
  'True alleen voor een broadcast-aanvraag aangemaakt zonder dat find_nearest_eligible_barber iemand vond (altijd ASAP) — requested_services is dan gevuld i.p.v. meteen booking_services-rijen, en de prijs is onbekend tot een barber ''m claimt via claim_open_broadcast_request(). Blijft true, ook na claimen/weigeren — puur een historisch label, nooit meer op false gezet.';
comment on column public.bookings.requested_services is
  'Alleen gezet voor open_request=true: [{"name": "...", "quantity": n}, ...] — servicenamen i.p.v. service_id''s, want er is nog geen barber om een catalogus-id aan te ontlenen. Null voor elke andere boeking.';
comment on column public.bookings.price_confirm_due_at is
  'Alleen gezet zodra een open_request-aanvraag geclaimd is (status price_pending) — de klant heeft tot dit tijdstip om de zojuist bepaalde prijs te bevestigen, anders valt de aanvraag automatisch terug naar open (zie /api/cron/expire-price-pending-requests). Zelfde patroon als payment_due_at (0040).';

-- ============================================================
-- create_open_broadcast_request — nieuw, naast (niet ter vervanging
-- van) create_booking_with_services. Alleen ASAP: geen p_scheduled_at-
-- parameter, p_requested_asap wordt niet eens meegegeven (altijd true).
-- ============================================================
create function public.create_open_broadcast_request(
  p_address text,
  p_note text,
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
  v_name text;
  v_quantity smallint;
  v_summary text := '';
begin
  if v_customer_id is null then
    raise exception 'Niet ingelogd';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Minstens één dienst is verplicht';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_name := v_line ->> 'name';
    v_quantity := (v_line ->> 'quantity')::smallint;
    if v_name is null or length(trim(v_name)) = 0 then
      raise exception 'Ongeldige dienstnaam';
    end if;
    if v_quantity is null or v_quantity < 1 or v_quantity > 6 then
      raise exception 'Ongeldig aantal voor een dienst';
    end if;
    if not exists (select 1 from public.services where name = v_name and active) then
      raise exception 'Onbekende dienst: %', v_name;
    end if;
    v_summary := v_summary || case when v_summary = '' then '' else ', ' end ||
      case when v_quantity > 1 then v_quantity || 'x ' else '' end || v_name;
  end loop;

  insert into public.bookings (
    customer_id, barber_id, address, note, requested_asap, scheduled_at, lat, lng,
    service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot,
    open_request, requested_services
  ) values (
    v_customer_id, null, p_address, p_note, true, null, p_lat, p_lng,
    v_summary, null, null,
    true, p_lines
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$$;

comment on function public.create_open_broadcast_request(text, text, double precision, double precision, jsonb) is
  'Alleen voor ASAP automatisch-toewijzen zonder match: maakt een broadcast-aanvraag zonder prijs aan (open_request=true, requested_services i.p.v. service_id''s). Wordt pas een echte, geprijsde boeking zodra een barber ''m claimt via claim_open_broadcast_request().';

grant execute on function public.create_open_broadcast_request(text, text, double precision, double precision, jsonb) to authenticated;

-- ============================================================
-- claim_open_broadcast_request — berekent de prijs ter plekke uit de
-- eigen services van de claimende barber (niet uit requested_services,
-- dat zijn alleen namen) en zet de boeking naar price_pending i.p.v.
-- meteen accepted.
-- ============================================================
create function public.claim_open_broadcast_request(p_booking_id uuid)
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
  v_claimed_id uuid;
begin
  if v_barber_id is null then
    raise exception 'Niet ingelogd';
  end if;

  -- Alleen leesbaar als de RLS-select-policy hieronder deze barber al
  -- matcht (locatie + kan alle gevraagde diensten leveren) — dus geen
  -- aparte matching-check hier nodig, de select zelf is de poort.
  select requested_services into v_lines
  from public.bookings
  where id = p_booking_id and barber_id is null and status = 'requested' and open_request;

  if v_lines is null then
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
  'Claimt een open_request-aanvraag (zie create_open_broadcast_request) tegen de EIGEN prijzen van de claimende barber — zet status naar price_pending (niet accepted) met een 30-minuten price_confirm_due_at, zodat de klant de zojuist bepaalde prijs nog moet bevestigen. Atomisch gated op barber_id is null and status=requested, zelfde geest als de bestaande claimBooking()-update-guard in queries.ts.';

grant execute on function public.claim_open_broadcast_request(uuid) to authenticated;

-- ============================================================
-- decline_price_and_reopen — klant weigert de voorgestelde prijs (of de
-- cron hieronder doet hetzelfde bij een timeout): maakt de claim
-- ongedaan, de aanvraag valt terug in exact hetzelfde open-zichtbare
-- pad als vóór het eerste claimen.
-- ============================================================
create function public.decline_price_and_reopen(p_booking_id uuid)
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
  'Klant weigert de door een barber voorgestelde prijs op een open_request-aanvraag — maakt de claim ongedaan (barber_id/prijs/booking_services terug naar niets) zodat de aanvraag weer zichtbaar/claimbaar wordt voor een andere barber, binnen de oorspronkelijke 1-uurs-geldigheid vanaf created_at. Zelfde reset wordt server-side gedaan door /api/cron/expire-price-pending-requests bij een timeout.';

grant execute on function public.decline_price_and_reopen(uuid) to authenticated;

-- ============================================================
-- barber_matches_location_and_service (laatst gewijzigd 0027) —
-- volledige body opnieuw, nieuwe tweede tak voor open_request-
-- aanvragen (nog geen booking_services, matcht op requested_services-
-- namen i.p.v. service_name_snapshot-regels).
-- ============================================================
create or replace function public.barber_matches_location_and_service(
  p_lat double precision,
  p_lng double precision,
  p_booking_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select
        bp.lat is not null and bp.lng is not null
        and p_lat is not null and p_lng is not null
        and public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) <= bp.work_area_km
        and (
          exists (
            select 1 from public.booking_services bs where bs.booking_id = p_booking_id
          )
          and not exists (
            select 1
            from public.booking_services bs
            where bs.booking_id = p_booking_id
              and not exists (
                select 1 from public.services s
                where s.barber_id = bp.id and s.name = bs.service_name_snapshot and s.active
              )
          )
          or
          exists (
            select 1 from public.bookings b
            where b.id = p_booking_id and b.open_request
              and not exists (
                select 1 from jsonb_array_elements(b.requested_services) line
                where not exists (
                  select 1 from public.services s
                  where s.barber_id = bp.id and s.name = line ->> 'name' and s.active
                )
              )
          )
        )
      from public.barber_profiles bp
      where bp.id = auth.uid()
    ),
    false
  );
$$;

comment on function public.barber_matches_location_and_service(double precision, double precision, uuid) is
  'Sinds 0042/0043: twee matchpaden — bestaande booking_services-regels (normale/al-geprijsde broadcast) zoals voorheen, of (nieuw) requested_services-namen voor een open_request-aanvraag die nog geen booking_services heeft. Bypass voor de kolom-grant-lockdown op barber_profiles.lat/lng (0020).';

grant execute on function public.barber_matches_location_and_service(double precision, double precision, uuid) to authenticated;

-- ============================================================
-- barber_is_online_and_available (laatst gewijzigd 0037) — volledige
-- body opnieuw, 'price_pending' toegevoegd aan de actieve-boeking-
-- uitsluiting: een barber die al op een prijsbevestiging van een klant
-- wacht, moet niet ook nog als "beschikbaar" gelden voor een nieuwe
-- match/claim.
-- ============================================================
create or replace function public.barber_is_online_and_available(p_barber_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select bp.is_online
        and bp.last_active_at is not null
        and bp.last_active_at > now() - interval '90 seconds'
        and (bp.availability ->> (case extract(isodow from now())::int
          when 1 then 'Ma' when 2 then 'Di' when 3 then 'Wo' when 4 then 'Do'
          when 5 then 'Vr' when 6 then 'Za' when 7 then 'Zo' end
        ))::boolean
        and not exists (
          select 1 from public.bookings b
          where b.barber_id = p_barber_id
            and b.status in ('price_pending', 'accepted', 'en_route', 'arrived', 'in_progress')
        )
      from public.barber_profiles bp
      where bp.id = p_barber_id
    ),
    false
  );
$$;

comment on function public.barber_is_online_and_available(uuid) is
  'Online + recent actief (last_active_at < 90s oud) + vandaag beschikbaar volgens weekschema + geen actieve/pending boeking (sinds 0042/0043 ook price_pending: wacht al op een klant-bevestiging, telt niet als beschikbaar voor iets nieuws). Gebruikt door find_nearest_eligible_barber + de broadcast-RLS-policies op bookings.';

grant execute on function public.barber_is_online_and_available(uuid) to authenticated;

-- ============================================================
-- RLS: vier policies krijgen "or bookings.open_request" — zonder dit
-- ziet een barber een open-ASAP-aanvraag-zonder-prijs nooit (die heeft
-- per definitie geen payments-rij en requested_asap=true, dus de
-- bestaande (booking_has_payment(..) or not requested_asap)-voorwaarde
-- is daar altijd false).
-- ============================================================

drop policy "Assigned barbers can view paid or pending-payment bookings" on public.bookings;
create policy "Assigned barbers can view paid, pending-payment, or open bookings"
  on public.bookings for select
  using (
    auth.uid() = barber_id
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap or bookings.open_request)
  );

drop policy "Assigned barbers can update paid or pending-payment bookings" on public.bookings;
create policy "Assigned barbers can update paid, pending-payment, or open bookings"
  on public.bookings for update
  using (
    auth.uid() = barber_id
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap or bookings.open_request)
  );

drop policy "Barbers can view open or pending-payment requests within their radius" on public.bookings;
create policy "Barbers can view open, pending-payment, or no-price requests within radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap or bookings.open_request)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  );

drop policy "Barbers can claim open or pending-payment requests within their radius" on public.bookings;
create policy "Barbers can claim open, pending-payment, or no-price requests within radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and (public.booking_has_payment(bookings.id) or not bookings.requested_asap or bookings.open_request)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  )
  with check (barber_id = auth.uid());

-- ============================================================
-- check_booking_status_transition (laatst gewijzigd 0040) — volledige
-- body opnieuw. Nieuw: de barber_id-zet-bypass accepteert ook
-- new.status='price_pending' (claimen), plus nieuwe toegestane
-- overgangen voor price_pending.
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
       and old.status = 'requested' and new.status in ('accepted', 'price_pending') then
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
      (old.status = 'price_pending' and new.status = 'cancelled') or
      (old.status = 'accepted' and new.status in ('en_route', 'cancelled')) or
      (old.status = 'en_route' and new.status in ('arrived', 'cancelled')) or
      (old.status = 'arrived' and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'completed')
    ) then
      raise exception 'Ongeldige statusovergang voor barber: % -> %', old.status, new.status;
    end if;
  else
    if not (
      (old.status in ('requested', 'accepted', 'en_route') and new.status = 'cancelled') or
      (old.status = 'price_pending' and new.status in ('accepted', 'requested', 'cancelled'))
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
-- notify_customer_on_status_change (laatst gewijzigd 0040) — volledige
-- body opnieuw. Nieuwe takken voor price_pending: binnenkomen (klant),
-- bevestigd door klant (barber), en terug naar requested (beide kanten,
-- afwijkende tekst t.o.v. een gewone requested->cancelled-timeout).
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
  if new.status = 'price_pending' and old.status = 'requested' then
    v_type := 'accepted';
    v_title := 'Barber gevonden — bevestig de prijs';
    v_body := 'Een barber heeft je aanvraag opgepakt. Bekijk en bevestig de prijs binnen 30 minuten.';
  elsif new.status = 'accepted' and old.status = 'price_pending' then
    v_type := 'accepted';
    v_title := 'Aanvraag bevestigd';
    v_body := 'Je hebt de prijs bevestigd — rond de betaling af.';
  elsif new.status = 'accepted' and new.payment_due_at is not null then
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
  elsif new.status = 'cancelled' and new.cancelled_by is null and old.status = 'requested' and new.open_request then
    v_type := 'cancelled';
    v_title := 'Aanvraag verlopen';
    v_body := 'Niemand heeft binnen 1 uur gereageerd op je aanvraag. Probeer het opnieuw.';
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

  -- Barber informeren zodra een price_pending-claim terugvalt naar
  -- requested (klant heeft geweigerd, of niet op tijd gereageerd) — dit
  -- is géén annulering (new.status blijft 'requested'), dus los van de
  -- cancelled-takken hierboven.
  if new.status = 'requested' and old.status = 'price_pending' and old.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      old.barber_id,
      'cancelled',
      'Aanvraag staat weer open',
      'De klant is niet akkoord gegaan met je prijsvoorstel — de aanvraag staat weer open voor andere barbers.',
      new.id
    );
  end if;

  return new;
end;
$$;

-- ============================================================
-- pg_cron — reopen (geen cancel) zodra een price_pending-claim zijn
-- 30-minuten-deadline overschrijdt. Losse route/wrapper, zelfde
-- single-purpose-conventie als de andere expiry-crons in dit project.
-- ============================================================
create function public.trigger_expire_price_pending_requests()
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
    raise notice 'Expire-price-pending-requests overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/expire-price-pending-requests',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_expire_price_pending_requests() is
  'Wrapper rond net.http_post() naar /api/cron/expire-price-pending-requests — handmatig te testen met `select public.trigger_expire_price_pending_requests();` in de SQL Editor.';

-- Elke 5 minuten, zelfde cadans als de andere tijd-gebaseerde crons —
-- ruim genoeg voor een venster van 30 minuten.
select cron.schedule('expire-price-pending-requests-job', '*/5 * * * *', 'select public.trigger_expire_price_pending_requests();');
