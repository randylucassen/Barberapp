-- De klant/barber-annuleringsmeldingen noemden nooit de reden, terwijl
-- die (cancelled_reason) allang op de boeking staat — de ontvanger zag
-- alleen "Je barber heeft de boeking geannuleerd." zonder te weten
-- waarom. Gemeld door de gebruiker; alleen de twee door-een-partij-
-- geannuleerde takken (barber->klant, klant->barber) krijgen hier een
-- reden bij — de systeem-timeout-takken (onbeantwoorde aanvraag, no-show)
-- hebben geen door-een-gebruiker-gekozen reden, die tekst is al
-- zelfverklarend.
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
    v_body := 'Je barber heeft de boeking geannuleerd. Reden: ' || coalesce(new.cancelled_reason, 'niet opgegeven') || '.';
  elsif new.status = 'cancelled' and new.cancelled_by is null and old.status = 'requested' then
    v_type := 'cancelled';
    v_title := 'Aanvraag verlopen';
    v_body := 'Niemand heeft binnen 30 minuten gereageerd op je aanvraag. Probeer het opnieuw.';
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

comment on function public.notify_customer_on_status_change() is
  'Dekt accepted/en_route/arrived/completed en cancelled in vier varianten (klant->barber, barber->klant, systeem-timeout-onbeantwoord->beide, systeem-no-show->klant). De twee door-een-partij-geannuleerde varianten (klant->barber, barber->klant) noemen sinds 0036 ook cancelled_reason. De no-show-barbermelding zelf komt niet hieruit maar uit /api/cron/expire-noshow-bookings.';
