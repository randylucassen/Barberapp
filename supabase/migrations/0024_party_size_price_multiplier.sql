-- "Aantal personen" (0022) beïnvloedde de prijs nog nergens — de klant
-- kon een aantal kiezen, maar betaalde en de barber verdiende nog
-- steeds de prijs voor één persoon. `price_cents_snapshot` wordt altijd
-- server-side afgeleid uit `services.price_cents` door
-- set_booking_snapshot_on_insert() (0017, pre-launch-audit-fix tegen
-- prijsmanipulatie) — de client-waarde wordt daar al genegeerd, dus de
-- vermenigvuldiging hoort in diezelfde functie te gebeuren, niet in de
-- client. Duration_minutes_snapshot blijft bewust ongewijzigd (single-
-- persoon duur) — of een knipbeurt voor meerdere personen ook langer
-- duurt is een aparte productbeslissing, niet gevraagd.
--
-- Volledige functie-body hier herhaald i.p.v. alleen het diff — zelfde
-- valkuil als CLAUDE.md-regel 22 beschrijft: `create or replace function`
-- vervangt de hele body, dus een incrementele wijziging die de rest laat
-- staan vereist de volledige, actuele versie als basis.
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
  new.duration_minutes_snapshot := v_service.duration_minutes;

  return new;
end;
$$;

comment on function public.set_booking_snapshot_on_insert() is
  'Sluit de bookings-INSERT-kwetsbaarheid uit de pre-launch audit: forceert status=requested en leidt de *_snapshot-velden altijd af uit services, ongeacht wat de client in de insert-payload zet. price_cents_snapshot vermenigvuldigt sinds 0024 met party_size (1-6, NOT NULL default 1, dus altijd een geldig getal op dit punt).';
