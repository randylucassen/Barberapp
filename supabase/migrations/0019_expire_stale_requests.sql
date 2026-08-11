-- Automatische timeout voor onbeantwoorde aanvragen (30 minuten): een
-- boeking die op 'requested' blijft staan — of direct naar één specifieke
-- barber, of broadcast zonder dat iemand 'm claimt — wordt anders nooit
-- vanzelf opgeruimd. Ontdekt via een echte, dag-oude testboeking die de
-- klant nooit had geannuleerd en die de nieuwe "Lopende boeking"-banner
-- op /klant/home voor altijd bleef tonen.
--
-- Zelfde opzet als trigger_escrow_release (0011): een SQL-wrapper-functie
-- + pg_cron-job die via pg_net een CRON_SECRET-beveiligde Route Handler
-- aanroept. Bewust een Route Handler i.p.v. dit volledig in SQL te doen —
-- een eventuele Stripe-refund (als de klant al wél betaald had vóór de
-- timeout) is in JS met de Stripe SDK simpeler en consistenter met de
-- bestaande cancel-and-refund-route dan pg_net-calls naar Stripe zelf.

-- ============================================================
-- Notificatie ook voor systeem-annuleringen (cancelled_by is null)
-- ============================================================
-- notify_customer_on_status_change (0007, uitgebreid in 0017) kende tot
-- nu toe alleen cancelled_by = 'barber'/'customer'. Een automatische
-- timeout heeft geen actor — cancelled_by blijft null — dus zonder deze
-- uitbreiding zou er stilzwijgend géén notificatie verstuurd worden.
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
  elsif new.status = 'cancelled' and new.cancelled_by is null then
    v_type := 'cancelled';
    v_title := 'Aanvraag verlopen';
    v_body := 'Niemand heeft binnen 30 minuten gereageerd op je aanvraag. Probeer het opnieuw.';
  end if;

  if v_type is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.customer_id, v_type, v_title, v_body, new.id);
  end if;

  -- Barber informeren als de klánt annuleert.
  if new.status = 'cancelled' and new.cancelled_by = 'customer' and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.barber_id, 'cancelled', 'Boeking geannuleerd', 'De klant heeft de boeking geannuleerd.', new.id);
  end if;

  -- Barber informeren als een directe aanvraag naar hem specifiek
  -- verloopt (bij een broadcast-aanvraag is barber_id nog null, dus
  -- niemand specifiek om te informeren).
  if new.status = 'cancelled' and new.cancelled_by is null and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.barber_id, 'cancelled', 'Aanvraag verlopen', 'Je hebt niet binnen 30 minuten gereageerd — de aanvraag is automatisch geannuleerd.', new.id);
  end if;

  return new;
end;
$$;

comment on function public.notify_customer_on_status_change() is
  'Dekt accepted/en_route/arrived/completed en cancelled in drie varianten (klant->barber, barber->klant, systeem-timeout->beide). Trigger-naam ongewijzigd (notify_customer_on_booking_status_change).';

-- ============================================================
-- pg_cron-trigger — zelfde app_config/CRON_SECRET-opzet als
-- trigger_escrow_release (0011)
-- ============================================================
create function public.trigger_expire_stale_requests()
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
    raise notice 'Expire-stale-requests overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/expire-stale-requests',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_expire_stale_requests() is
  'Wrapper rond net.http_post() naar /api/cron/expire-stale-requests — handmatig te testen met `select public.trigger_expire_stale_requests();` in de SQL Editor.';

-- Elke 5 minuten is ruim genoeg voor een timeout van 30 minuten (max.
-- ~5 min afwijking) zonder onnodig vaak te draaien.
select cron.schedule('expire-stale-requests-job', '*/5 * * * *', 'select public.trigger_expire_stale_requests();');
