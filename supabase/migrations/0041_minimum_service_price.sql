-- Algemeen minimumbedrag per dienst (€25), met de gebruiker afgestemd —
-- voorkomt een race-naar-de-bodem nu barbers hun eigen prijzen volledig
-- vrij bepalen. Geldt alleen voor actieve diensten: een conditionele
-- check (not active or price_cents >= 2500) i.p.v. een kale check op de
-- kolom, zodat historische/inactieve rijen met een oudere, lagere prijs
-- niet alsnog de migratie laten falen of herschreven hoeven te worden.
--
-- barber/aanmelden (webapp én native) doet bij elke wijziging een
-- "verwijder alle diensten, voeg opnieuw in"-reset (zie CLAUDE.md regel
-- over services), dus een actieve dienst komt hier nooit per ongeluk
-- onder de grens — deze constraint is het laatste, harde vangnet tegen
-- een kapotte/omzeilde client, niet de voornaamste validatie (die hoort
-- in de UI, met een duidelijke Nederlandse foutmelding vóórdat de
-- gebruiker ooit op "Verstuur aanmelding" kan drukken).
--
-- Backfill vooraf nodig: er stonden al actieve diensten onder €25 (de
-- oude standaardcatalogus had Baard trimmen/Kids/Kinderknipbeurt op
-- €15-€20) — die worden hier eenmalig opgehoogd naar het nieuwe
-- minimum, anders zou de constraint hieronder meteen falen op bestaande
-- data. Bewust gelijkgetrokken op precies het minimum (niet hoger) om de
-- prijsverandering zo klein mogelijk te houden.
update public.services
set price_cents = 2500
where active = true
  and price_cents < 2500;

alter table public.services
  add constraint services_min_active_price
  check (not active or price_cents >= 2500);

comment on constraint services_min_active_price on public.services is
  'Algemeen minimumbedrag van €25 per actieve dienst — voorkomt een race-naar-de-bodem nu barbers hun eigen prijzen vrij bepalen. Zie 0041.';
