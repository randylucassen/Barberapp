-- Twee vervolgpunten op "aantal personen" (0022/0024), proactief
-- uitgezocht en met de gebruiker afgestemd i.p.v. achteraf gemeld:
--
-- 1) Duur schaalt nu ook mee (zelfde patroon als prijs, 0024): 30 min
--    voor 1 persoon werd 90 min voor 3 personen bleef voorheen op 30 min
--    staan, wat de barber een veel te optimistisch beschikbaarheidsbeeld
--    gaf.
-- 2) "Wordt de barber automatisch weer beschikbaar, of moet hij zichzelf
--    weer online zetten?" — bleek een bestaand gat: matching checkte tot
--    nu toe alleen de handmatige is_online-schakelaar en het weekschema,
--    nooit of de barber al een lopende boeking had. Met langere ritten
--    (meerdere personen) werd dat een reëler risico. Met de gebruiker
--    afgestemd: barber wordt automatisch uitgesloten van nieuwe aan-
--    vragen zolang hij een actieve boeking heeft, en is automatisch
--    weer beschikbaar zodra die afgerond/geannuleerd is — geen
--    handmatige stap nodig.

-- Volledige functie-body herhaald, zelfde reden als 0024 (CLAUDE.md-
-- regel 22: create or replace vervangt de hele body).
create or replace function public.set_booking_snapshot_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
begin
  new.status := 'requested';
  new.completed_at := null;
  new.cancelled_reason := null;
  new.cancelled_by := null;

  if new.service_id is null then
    raise exception 'service_id is verplicht';
  end if;

  select barber_id, name, price_cents, duration_minutes
  into v_service
  from public.services
  where id = new.service_id and active;

  if v_service is null then
    raise exception 'Ongeldige of niet-actieve dienst';
  end if;

  if new.barber_id is not null and new.barber_id is distinct from v_service.barber_id then
    raise exception 'Deze dienst hoort niet bij de opgegeven barber';
  end if;

  new.service_name_snapshot := v_service.name;
  new.price_cents_snapshot := v_service.price_cents * new.party_size;
  new.duration_minutes_snapshot := v_service.duration_minutes * new.party_size;

  return new;
end;
$$;

comment on function public.set_booking_snapshot_on_insert() is
  'Sluit de bookings-INSERT-kwetsbaarheid uit de pre-launch audit: forceert status=requested en leidt de *_snapshot-velden altijd af uit services, ongeacht wat de client in de insert-payload zet. price_cents_snapshot en duration_minutes_snapshot vermenigvuldigen sinds 0024/0025 met party_size (1-6, NOT NULL default 1, dus altijd een geldig getal op dit punt).';

-- Zelfde reden om de volledige body te herhalen als hierboven.
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
        and (bp.availability ->> (case extract(isodow from now())::int
          when 1 then 'Ma' when 2 then 'Di' when 3 then 'Wo' when 4 then 'Do'
          when 5 then 'Vr' when 6 then 'Za' when 7 then 'Zo' end
        ))::boolean
        and not exists (
          select 1 from public.bookings b
          where b.barber_id = p_barber_id
            and b.status in ('accepted', 'en_route', 'arrived', 'in_progress')
        )
      from public.barber_profiles bp
      where bp.id = p_barber_id
    ),
    false
  );
$$;

comment on function public.barber_is_online_and_available(uuid) is
  'Online + vandaag beschikbaar volgens weekschema + geen actieve boeking (sinds 0025 — voorkomt dat een barber tijdens een lopende rit alsnog een nieuwe aanvraag krijgt; wordt automatisch weer true zodra die boeking completed/cancelled is, geen handmatige stap nodig). Gebruikt door find_nearest_eligible_barber (matching) en de "Barbers can view/claim paid open requests"-RLS-policies op bookings (0007/0021) — dus dit dekt zowel het auto-toewijzen als het zichtbaar worden van broadcast-aanvragen voor de barber zelf.';
