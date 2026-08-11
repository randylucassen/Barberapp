-- Meerdere (verschillende) diensten per boeking, elk met een eigen
-- aantal (bv. 2x Kids + 1x Knippen+baard) — met de gebruiker afgestemd
-- dat "aantal personen" als los totaal-veld (party_size) volledig
-- verdwijnt en alleen nog per dienst-regel bestaat, en dat een
-- gedeeltelijke terugbetaling straks per dienst-regel kan (zie
-- DisputesTable.tsx/resolve-route, apart aangepast na deze migratie).
--
-- Architectuurkeuze: één `bookings`-rij blijft bestaan met AGGREGAAT-
-- velden (`price_cents_snapshot`/`duration_minutes_snapshot` = som over
-- alle regels, `service_name_snapshot` = leesbare samenvatting zoals
-- "2x Kids, Knippen + baard") zodat de tientallen schermen die nu al
-- `booking.priceCents`/`durationMinutes`/`serviceName` los uitlezen
-- ongewijzigd blijven werken. De losse regels staan in de nieuwe
-- `booking_services`-tabel, alleen nodig voor schermen die de
-- individuele diensten moeten tonen (boekingsscherm, barber/aanvraag,
-- admin-geschillen-per-regel-terugbetaling).
--
-- `bookings.service_id`/`party_size` verdwijnen (een enkel service_id
-- heeft geen betekenis meer bij meerdere diensten). De hele
-- prijs/duur-afleiding die voorheen in de `before insert`-trigger zat
-- (regel 20/22 CLAUDE.md) verhuist naar een nieuwe
-- `create_booking_with_services()` security-definer-functie, die alle
-- regels valideert tegen de echte `services`-tabel en zelf de bookings-
-- rij + alle booking_services-rijen atomisch aanmaakt. De client-INSERT-
-- grant op `bookings` wordt daarom ingetrokken: er is vanaf nu maar één
-- pad om een boeking aan te maken. Dat sluit de kwetsbaarheid uit de
-- pre-launch audit nog steviger af dan de oude trigger (geen kolom meer
-- waarop de client kan vertrouwen, laat staan aan kan sleutelen).

create table public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  service_name_snapshot text not null,
  quantity smallint not null check (quantity between 1 and 6),
  unit_price_cents_snapshot integer not null check (unit_price_cents_snapshot >= 0),
  unit_duration_minutes_snapshot integer not null check (unit_duration_minutes_snapshot > 0),
  created_at timestamptz not null default now()
);

create index booking_services_booking_id_idx on public.booking_services (booking_id);

comment on table public.booking_services is
  'Eén rij per gekozen dienst binnen een boeking (met aantal). Alleen te schrijven via create_booking_with_services() — geen insert/update/delete-grant voor authenticated, zelfde patroon als payments/disputes (regel 15 CLAUDE.md).';

alter table public.booking_services enable row level security;

create policy "Customers can view own booking service lines"
  on public.booking_services for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid()));

create policy "Barbers can view own booking service lines"
  on public.booking_services for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.barber_id = auth.uid()));

grant select on public.booking_services to authenticated;

-- ============================================================
-- bookings: service_id/party_size weg, insert-grant weg (alleen nog via
-- create_booking_with_services()).
-- ============================================================

revoke insert on public.bookings from authenticated;

alter table public.bookings drop column service_id;
alter table public.bookings drop column party_size;

-- Volledige body herhaald per regel 22 CLAUDE.md — nu drastisch simpeler:
-- geen service_id meer om uit af te leiden, dus geen prijs/duur-afleiding
-- meer hier. create_booking_with_services() zet die velden zelf, al vóór
-- de insert, met al-gevalideerde server-side bedragen — deze trigger is
-- puur nog een laatste defensieve laag tegen een toekomstige per-ongeluk
-- te ruime grant (exact het scenario van de 0023-regressie deze sessie),
-- niet meer de enige verdedigingslinie.
create or replace function public.set_booking_snapshot_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'requested';
  new.completed_at := null;
  new.cancelled_reason := null;
  new.cancelled_by := null;
  return new;
end;
$$;

comment on function public.set_booking_snapshot_on_insert() is
  'Forceert status/completed_at/cancelled_* op elke insert, ongeacht wat de client stuurt. Sinds 0027 puur nog een defensieve laag — de enige geldige weg om een boeking aan te maken is create_booking_with_services(), die zelf al price/duration/service_name_snapshot met server-geverifieerde bedragen zet vóór de insert.';

-- ============================================================
-- create_booking_with_services: enige geldige pad om een boeking (+
-- regels) aan te maken. p_barber_id = null betekent een broadcast-
-- aanvraag (automatisch toewijzen, zie klant/boeking) — de regels zijn
-- dan gebaseerd op de dichtstbijzijnde kandidaat-barber's services (voor
-- een realistische prijsindicatie), maar welke barber 'm daadwerkelijk
-- claimt wordt pas later bepaald door barber_matches_location_and_service
-- hieronder (moet ALLE gevraagde diensten aanbieden, niet per se dezelfde
-- barber als waar de prijsindicatie vandaan kwam — bestaand gedrag,
-- ongewijzigd sinds Fase 5).
-- ============================================================

create function public.create_booking_with_services(
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
begin
  if v_customer_id is null then
    raise exception 'Niet ingelogd';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Minstens één dienst is verplicht';
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
  'Enige geldige weg om een boeking aan te maken sinds 0027 (bookings heeft geen insert-grant meer voor authenticated). p_lines: [{"service_id": "...", "quantity": 1-6}, ...] — elke regel wordt gevalideerd tegen de echte services-tabel (bestaat, actief, hoort bij p_barber_id indien die gezet is), price/duration/service_name_snapshot worden hier berekend, nooit vertrouwd van de client.';

grant execute on function public.create_booking_with_services(
  uuid, text, text, boolean, timestamptz, double precision, double precision, jsonb
) to authenticated;

-- ============================================================
-- barber_matches_location_and_service: matchte voorheen op een enkele
-- exacte servicenaam (bookings.service_name_snapshot) — die kolom is nu
-- een samenvattingstekst ("2x Kids, Knippen + baard") en kan dus nooit
-- meer exact overeenkomen met één services.name. Signatuur aangepast
-- naar een booking_id: een barber matcht een broadcast-aanvraag nu als
-- hij ALLE dienst-regels van die boeking kan leveren (niet noodzakelijk
-- tegen dezelfde prijs als de barber waarvan de prijsindicatie kwam —
-- bestaand gedrag, zie hierboven).
-- ============================================================

-- Eerst de twee policies weg die de oude (text-signatuur) functie nog
-- gebruiken — anders weigert drop function (afhankelijkheid via de
-- policy-expressie), zelfde volgorde-eis als bij een gewone tabel-
-- afhankelijkheid.
drop policy "Barbers can view paid open requests within their radius" on public.bookings;
drop policy "Barbers can claim paid open requests within their radius" on public.bookings;

drop function if exists public.barber_matches_location_and_service(double precision, double precision, text);

create function public.barber_matches_location_and_service(
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
        and not exists (
          select 1
          from public.booking_services bs
          where bs.booking_id = p_booking_id
            and not exists (
              select 1 from public.services s
              where s.barber_id = bp.id and s.name = bs.service_name_snapshot and s.active
            )
        )
      from public.barber_profiles bp
      where bp.id = auth.uid()
    ),
    false
  );
$$;

comment on function public.barber_matches_location_and_service(double precision, double precision, uuid) is
  'Sinds 0027: matcht op alle dienst-regels van de boeking (booking_services), niet meer op een enkele service_name_snapshot-string. Bypass voor de kolom-grant-lockdown op barber_profiles.lat/lng (0020), zelfde reden als voorheen.';

grant execute on function public.barber_matches_location_and_service(double precision, double precision, uuid) to authenticated;

create policy "Barbers can view paid open requests within their radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and public.booking_has_payment(bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  );

create policy "Barbers can claim paid open requests within their radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and public.booking_has_payment(bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and bookings.lat is not null and bookings.lng is not null
    and public.barber_matches_location_and_service(bookings.lat, bookings.lng, bookings.id)
  )
  with check (barber_id = auth.uid());

-- ============================================================
-- find_nearest_eligible_barber: accepteerde voorheen één servicenaam,
-- nu een array — een barber matcht alleen als hij ALLE gevraagde namen
-- aanbiedt (having-check op aantal distinct matches). Retourneert de
-- services zelf als jsonb-array i.p.v. één service_id/price/duration,
-- want dat is nu per definitie meer dan één regel.
-- ============================================================

drop function if exists public.find_nearest_eligible_barber(text, double precision, double precision);

create function public.find_nearest_eligible_barber(
  p_service_names text[],
  p_lat double precision,
  p_lng double precision
)
returns table (
  barber_id uuid,
  distance_km double precision,
  services jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    bp.id as barber_id,
    public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) as distance_km,
    jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'priceCents', s.price_cents, 'durationMinutes', s.duration_minutes
    )) as services
  from public.barber_profiles bp
  join public.profiles p on p.id = bp.id
  join public.services s on s.barber_id = bp.id and s.name = any (p_service_names) and s.active
  where p.barber_status = 'approved'
    and bp.lat is not null and bp.lng is not null
    and public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) <= bp.work_area_km
    and public.barber_is_online_and_available(bp.id)
  group by bp.id, bp.lat, bp.lng
  having count(distinct s.name) = array_length(p_service_names, 1)
  order by distance_km asc
  limit 1;
$$;

comment on function public.find_nearest_eligible_barber(text[], double precision, double precision) is
  'Sinds 0027: neemt een array van servicenamen i.p.v. één naam — een barber matcht alleen als hij ALLE gevraagde diensten aanbiedt. Puur voor de prijsindicatie/preview bij automatisch toewijzen; welke barber de aanvraag daadwerkelijk claimt loopt via de broadcast-RLS-policies hierboven, niet via deze functie.';

grant execute on function public.find_nearest_eligible_barber(text[], double precision, double precision) to authenticated;
