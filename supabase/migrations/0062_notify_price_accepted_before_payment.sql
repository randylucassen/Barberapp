-- Bug gemeld door de gebruiker: de "Aanvraag bevestigd — rond de
-- betaling af"-melding kwam te laat binnen. Oorzaak: die melding hing
-- aan de price_pending -> accepted status-overgang
-- (notify_customer_on_status_change, 0043) — maar sinds migratie 0057
-- kan die overgang alleen nog plaatsvinden NADAT er al succesvol
-- betaald is (de database-guard staat 'm anders niet toe). De klant
-- kreeg dus de instructie "rond de betaling af" pas op het moment dat
-- de betaling allang rond was — tegelijk met (en zinloos naast) de
-- al bestaande "Betaling ontvangen"-melding (notify_on_payment_received,
-- 0013).
--
-- Fix, twee delen:
-- 1. Nieuwe RPC notify_price_accepted() — rechtstreeks aangeroepen
--    vanuit de klant-app zodra de klant op "Akkoord, ga naar betalen"
--    tikt (vóór het navigeren naar het betaalscherm), niet gekoppeld
--    aan een status-overgang (die vindt op dat moment nog niet plaats,
--    bewust sinds de eerdere premature-acceptatie-fix). Security
--    definer nodig: er is geen insert-policy op notifications voor
--    authenticated (0003 heeft alleen select/update-own).
-- 2. De price_pending->accepted-tak in notify_customer_on_status_change
--    is verwijderd — die overgang betekent nu altijd "betaling net
--    gelukt", en valt voortaan door naar de generieke
--    new.status='accepted'-tak hieronder ("Je barber heeft je aanvraag
--    geaccepteerd"), wat naast "Betaling ontvangen" prima samenhangt.
create function public.notify_price_accepted(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_status public.booking_status;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select customer_id, status into v_customer_id, v_status
  from public.bookings
  where id = p_booking_id;

  if v_customer_id is distinct from auth.uid() then
    raise exception 'Niet jouw aanvraag';
  end if;
  if v_status is distinct from 'price_pending' then
    raise exception 'Deze aanvraag staat niet (meer) in price_pending';
  end if;

  insert into public.notifications (user_id, type, title, body, related_booking_id)
  values (
    auth.uid(),
    'accepted',
    'Aanvraag bevestigd',
    'Je hebt de prijs bevestigd — rond de betaling af.',
    p_booking_id
  );
end;
$$;

comment on function public.notify_price_accepted(uuid) is
  'Stuurt de "rond de betaling af"-melding naar de klant zelf, rechtstreeks aangeroepen vanuit handleConfirmPrice() (webapp/native) vóór het navigeren naar het betaalscherm — niet meer gekoppeld aan de price_pending->accepted-statusovergang, want die vindt sinds de premature-acceptatie-fix pas plaats ná een geslaagde betaling (te laat voor deze instructie). Gated op booking.status=price_pending en de eigen sessie, zelfde geest als decline_price_and_reopen (0043).';

grant execute on function public.notify_price_accepted(uuid) to authenticated;

-- ============================================================
-- notify_customer_on_status_change (laatst 0043) — volledige body
-- opnieuw, alleen de price_pending->accepted-tak verwijderd (zie
-- toelichting hierboven). Rest ongewijzigd.
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
