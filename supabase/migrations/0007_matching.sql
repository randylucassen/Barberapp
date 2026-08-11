-- Fase 5: automatische matching. Voegt locatie (lat/lng), een online-
-- status voor barbers, een afstandsfunctie, en de broadcast/claim-flow
-- toe voor automatisch-toegewezen aanvragen (barber_id = null totdat een
-- geschikte barber 'm claimt). Puur additief t.o.v. 0001-0006 — de
-- bestaande Fase 4-flow (klant kiest zelf een barber) blijft ongewijzigd
-- werken. Voer uit ná 0001-0006.

-- ============================================================
-- Locatie- en online-kolommen
-- ============================================================

alter table public.barber_profiles add column lat double precision;
alter table public.barber_profiles add column lng double precision;
alter table public.barber_profiles add column is_online boolean not null default false;

alter table public.bookings add column lat double precision;
alter table public.bookings add column lng double precision;

comment on column public.barber_profiles.is_online is
  'Vervangt de vroegere lokale React-state op /barber/dashboard — nu echt persistent, en de basis voor "alleen beschikbare barbers" bij matching.';
comment on column public.bookings.lat is
  'Alleen gezet voor automatisch-toegewezen aanvragen (barber_id begint op null) — nodig om de afstand tot geschikte barbers te bepalen. Handmatig gekozen boekingen (Fase 4) laten dit leeg.';

grant update (lat, lng, is_online) on public.barber_profiles to authenticated;

-- ============================================================
-- haversine_km — afstand in km tussen twee lat/lng-punten
-- ============================================================

create function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
as $$
  select 6371 * acos(
    least(1.0, greatest(-1.0,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
      + sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

comment on function public.haversine_km is
  'Eenvoudige boloppervlak-afstandsformule, geen PostGIS-extensie nodig op deze schaal (stad-niveau matching). least/greatest voorkomt een acos()-domeinfout door floating-point afronding wanneer twee punten (bijna) identiek zijn.';

grant execute on function public.haversine_km(double precision, double precision, double precision, double precision) to authenticated;

-- ============================================================
-- barber_is_online_and_available — "alleen beschikbare barbers", op één
-- plek gedefinieerd en hergebruikt door find_nearest_eligible_barber en
-- de twee broadcast-RLS-policies hieronder, i.p.v. dezelfde dag-van-de-
-- week-logica drie keer te dupliceren.
-- ============================================================

create function public.barber_is_online_and_available(p_barber_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select bp.is_online and (bp.availability ->> (case extract(isodow from now())::int
        when 1 then 'Ma' when 2 then 'Di' when 3 then 'Wo' when 4 then 'Do'
        when 5 then 'Vr' when 6 then 'Za' when 7 then 'Zo' end
      ))::boolean
      from public.barber_profiles bp
      where bp.id = p_barber_id
    ),
    false
  );
$$;

grant execute on function public.barber_is_online_and_available(uuid) to authenticated;

-- ============================================================
-- find_nearest_eligible_barber — voor de klant-kant van matching: welke
-- prijs/dienst tonen we als indicatie bij een automatisch-toegewezen
-- aanvraag? security definer, want de klant mag nooit rechtstreeks
-- barber_profiles.lat/lng of is_online kunnen lezen (RLS staat dat niet
-- toe) — deze functie geeft bewust alleen barber_id/service_id/prijs/
-- duur/afstand terug, nooit naam of coördinaten.
-- ============================================================

create function public.find_nearest_eligible_barber(
  p_service_name text,
  p_lat double precision,
  p_lng double precision
)
returns table (
  barber_id uuid,
  service_id uuid,
  price_cents integer,
  duration_minutes integer,
  distance_km double precision
)
language sql
security definer
set search_path = public
stable
as $$
  select
    bp.id as barber_id,
    s.id as service_id,
    s.price_cents,
    s.duration_minutes,
    public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) as distance_km
  from public.barber_profiles bp
  join public.profiles p on p.id = bp.id
  join public.services s on s.barber_id = bp.id
  where p.barber_status = 'approved'
    and bp.lat is not null and bp.lng is not null
    and s.name = p_service_name
    and s.active
    and public.haversine_km(bp.lat, bp.lng, p_lat, p_lng) <= bp.work_area_km
    and public.barber_is_online_and_available(bp.id)
  order by distance_km asc
  limit 1;
$$;

grant execute on function public.find_nearest_eligible_barber(text, double precision, double precision) to authenticated;

-- ============================================================
-- Broadcast-zichtbaarheid + claim: nieuwe RLS-policies op bookings
-- (additief naast de bestaande policies uit 0003)
-- ============================================================

create policy "Barbers can view open requests within their radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and public.barber_is_online_and_available(auth.uid())
    and exists (
      select 1
      from public.barber_profiles bp
      join public.services s on s.barber_id = bp.id
      where bp.id = auth.uid()
        and bp.lat is not null and bp.lng is not null
        and bookings.lat is not null and bookings.lng is not null
        and s.name = bookings.service_name_snapshot
        and s.active
        and public.haversine_km(bp.lat, bp.lng, bookings.lat, bookings.lng) <= bp.work_area_km
    )
  );

create policy "Barbers can claim open requests within their radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and public.barber_is_online_and_available(auth.uid())
    and exists (
      select 1
      from public.barber_profiles bp
      join public.services s on s.barber_id = bp.id
      where bp.id = auth.uid()
        and bp.lat is not null and bp.lng is not null
        and bookings.lat is not null and bookings.lng is not null
        and s.name = bookings.service_name_snapshot
        and s.active
        and public.haversine_km(bp.lat, bp.lng, bookings.lat, bookings.lng) <= bp.work_area_km
    )
  )
  with check (barber_id = auth.uid());

-- Zonder deze twee policies zou een barber een openstaande aanvraag van
-- iemand anders nooit kunnen zien/claimen (de bestaande policies uit 0003
-- vereisen expliciet auth.uid() = customer_id/barber_id). De straal- en
-- dienst-check zit in de policy zelf, dus een barber ziet nooit een
-- adres/opmerking van een klant buiten zijn eigen werkgebied.

grant update (barber_id) on public.bookings to authenticated;

-- ============================================================
-- check_booking_status_transition uitbreiden met de claim-tak
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

  -- barber_id mag alleen veranderen via precies dit patroon: een barber
  -- die zichzelf toewijst aan een nog onbezette, aangevraagde boeking.
  -- RLS (hierboven) bepaalt al wélke barber dat voor welke boeking mag;
  -- hier wordt alleen de overgang zelf gevalideerd. Elke andere poging om
  -- barber_id te wijzigen wordt hard geweigerd.
  if new.barber_id is distinct from old.barber_id then
    if old.barber_id is null and new.barber_id = auth.uid()
       and old.status = 'requested' and new.status = 'accepted' then
      return new;
    end if;
    raise exception 'barber_id mag alleen gezet worden door een openstaande aanvraag te claimen';
  end if;

  -- Vanaf hier ongewijzigd t.o.v. Fase 4: barber_id verandert niet in deze
  -- update, dus alleen de gewone status-overgangsregels gelden.
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

  return new;
end;
$$;

drop trigger if exists check_booking_status_transition_trigger on public.bookings;
create trigger check_booking_status_transition_trigger
  before update on public.bookings
  for each row
  when (new.status is distinct from old.status or new.barber_id is distinct from old.barber_id)
  execute procedure public.check_booking_status_transition();

comment on function public.check_booking_status_transition() is
  'Statusmachine voor bookings, incl. de Fase 5-claimtak: barber_id mag alleen van null naar auth.uid() gaan tegelijk met requested->accepted (een barber die een openstaande aanvraag claimt). Daarbuiten identiek aan de Fase 4-versie: requested->accepted->en_route->arrived->in_progress->completed (alleen barber), cancelled als escape-hatch vanaf requested/accepted/en_route (klant of barber).';

-- ============================================================
-- Klant-notificaties bij statuswijziging (in-app, geen echte push)
-- ============================================================

create function public.notify_customer_on_status_change()
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
  if new.status = 'accepted' then
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
  else
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, related_booking_id)
  values (new.customer_id, v_type, v_title, v_body, new.id);

  return new;
end;
$$;

comment on function public.notify_customer_on_status_change() is
  'Dit is het "backend-logica"-insertpad dat notifications (0003) altijd al bedoelde — authenticated heeft bewust geen insert-grant op die tabel, alleen deze security-definer trigger mag rijen aanmaken. Scope Fase 5: alleen klant-notificaties bij accepted/en_route/arrived; completed/cancelled en barber-notificaties zijn een open punt voor een latere fase.';

create trigger notify_customer_on_booking_status_change
  after update on public.bookings
  for each row
  when (new.status is distinct from old.status)
  execute procedure public.notify_customer_on_status_change();
