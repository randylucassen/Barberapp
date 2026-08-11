-- Pre-launch audit (Fase 11 vervolg): fixt de Critical/High bevindingen uit
-- de volledige codebase-audit. Zie PROJECT.md "Pre-launch audit" voor de
-- volledige bevindingenlijst en context per fix.

-- ============================================================
-- FIX 1 (Critical): bookings-INSERT liet élk veld ongecontroleerd door —
-- een klant kon een boeking forgeren met status='completed' en een
-- zelfgekozen prijs (nep-reviews zonder betaling, prijsmanipulatie op
-- echte boekingen, want create-payment-intent/de webhook vertrouwen
-- price_cents_snapshot uit deze rij onvoorwaardelijk). De policy checkte
-- alleen "wie" (auth.uid() = customer_id), nooit "wat".
-- ============================================================

create function public.set_booking_snapshot_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
begin
  -- Statusvelden staan nooit ter keuze van de client, ongeacht wat de
  -- insert-payload bevat — een nieuwe boeking begint altijd schoon.
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

  -- Een broadcast-aanvraag heeft nog geen toegewezen barber (barber_id
  -- null, zie Fase 5) — dan is er niets om tegen te valideren. Zodra een
  -- klant wél direct een barber kiest, moet de dienst ook echt van díe
  -- barber zijn (voorkomt dat een dure barber gekoppeld wordt aan de
  -- goedkope dienst van een ander).
  if new.barber_id is not null and new.barber_id is distinct from v_service.barber_id then
    raise exception 'Deze dienst hoort niet bij de opgegeven barber';
  end if;

  -- Snapshot altijd server-side afleiden — nooit de client-waarden
  -- vertrouwen, ook al stuurt de app zelf al de juiste waarden mee.
  new.service_name_snapshot := v_service.name;
  new.price_cents_snapshot := v_service.price_cents;
  new.duration_minutes_snapshot := v_service.duration_minutes;

  return new;
end;
$$;

comment on function public.set_booking_snapshot_on_insert() is
  'Sluit de bookings-INSERT-kwetsbaarheid uit de pre-launch audit: forceert status=requested en leidt de *_snapshot-velden altijd af uit services, ongeacht wat de client in de insert-payload zet.';

create trigger set_booking_snapshot_on_insert_trigger
  before insert on public.bookings
  for each row
  execute procedure public.set_booking_snapshot_on_insert();

-- Kolom-scoping op de insert-grant zelf, als tweede verdedigingslinie
-- (zelfde precedent als de al bestaande, kolom-scoped update-grant hieronder
-- op deze tabel) — ook als de trigger ooit een bug heeft, kan een client
-- dan nog steeds geen status/completed_at/cancelled_* meesturen.
revoke insert on public.bookings from authenticated;
grant insert (
  customer_id, barber_id, service_id, service_name_snapshot,
  price_cents_snapshot, duration_minutes_snapshot, address, note,
  requested_asap, scheduled_at, lat, lng
) on public.bookings to authenticated;

-- ============================================================
-- FIX 2 (Critical): een barber kon zelf stripe_payouts_enabled op true
-- zetten via een directe PostgREST-call (de kolom-grant liet dit toe,
-- zonder with check) — de escrow-cron vertrouwt dit veld onvoorwaardelijk
-- om te bepalen of een Connect-account echt KYC-geverifieerd is.
-- stripe_account_id blijft wél client-schrijfbaar: connect-onboarding/
-- route.ts zet die bewust via de sessie-client zelf (niet de service
-- role) bij het aanmaken van het Connect-account.
-- ============================================================

revoke update (stripe_payouts_enabled) on public.barber_profiles from authenticated;

-- ============================================================
-- FIX 3 (High): rating_avg werd bij elke nieuwe review incrementeel
-- herberekend uit de al afgeronde vorige waarde — dat drift-t uiteen van
-- de echte avg() zodra er reviews verwijderd worden (0016's
-- on_review_deleted doet wél een echte herberekening). Één functie voor
-- beide paden voorkomt dat de twee ooit weer uit elkaar kunnen lopen.
-- ============================================================

create or replace function public.update_barber_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.barber_profiles
  set
    rating_avg = (select round(avg(stars), 1) from public.reviews where barber_id = new.barber_id),
    rating_count = (select count(*) from public.reviews where barber_id = new.barber_id)
  where id = new.barber_id;
  return new;
end;
$$;

comment on function public.update_barber_rating() is
  'Volledige herberekening (niet meer incrementeel) — zelfde methode als recompute_barber_rating_on_delete() (0016), zodat rating_avg nooit meer kan afwijken tussen aanmaken en verwijderen van een review.';

-- ============================================================
-- FIX 4 (High): notify_customer_on_status_change dekte alleen
-- accepted/en_route/arrived — completed en cancelled (in beide richtingen)
-- stuurden nooit een notificatie. Met name een barber die niet hoort dat
-- de klant een lopende rit annuleert (geen enkel ander meldingspad, geen
-- polling op /barber/rit) is een reëel, vaak voorkomend gemis geweest.
-- ============================================================

alter type public.notification_type add value 'completed';
alter type public.notification_type add value 'cancelled';

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
  elsif new.status = 'completed' then
    v_type := 'completed';
    v_title := 'Boeking afgerond';
    v_body := 'Je afspraak is afgerond. Laat gerust een review achter.';
  elsif new.status = 'cancelled' and new.cancelled_by = 'barber' then
    v_type := 'cancelled';
    v_title := 'Boeking geannuleerd';
    v_body := 'Je barber heeft de boeking geannuleerd.';
  end if;

  if v_type is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.customer_id, v_type, v_title, v_body, new.id);
  end if;

  -- Barber informeren als de klánt annuleert (was voorheen geen enkel
  -- meldingspad — de barber kon onderweg zijn naar een al afgezegde rit
  -- zonder het te weten).
  if new.status = 'cancelled' and new.cancelled_by = 'customer' and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.barber_id, 'cancelled', 'Boeking geannuleerd', 'De klant heeft de boeking geannuleerd.', new.id);
  end if;

  return new;
end;
$$;

comment on function public.notify_customer_on_status_change() is
  'Uitgebreid (pre-launch audit): dekt nu ook completed (klant) en cancelled in beide richtingen (klant->barber, barber->klant). Trigger-naam ongewijzigd gelaten (notify_customer_on_booking_status_change) ook al notificeert de functie nu soms de barber, om geen onnodige trigger-drop/recreate te doen.';

-- ============================================================
-- FIX 5 (High): escrow-release-cron had geen locking tussen overlappende
-- runs — twee gelijktijdige invocaties konden dezelfde 'held'-betaling
-- allebei oppakken en de barber dubbel uitbetalen. 'releasing' is een
-- kort-levende tussenstatus: de cron claimt een rij eerst atomisch
-- (update ... where escrow_state = 'held', zelfde patroon als
-- claimBooking()) vóór de Stripe-transfer, en zet 'm terug naar 'held'
-- bij een mislukte transfer zodat de volgende run het gewoon opnieuw
-- probeert.
-- ============================================================

alter type public.escrow_state add value 'releasing';
