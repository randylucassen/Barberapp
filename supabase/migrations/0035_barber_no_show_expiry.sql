-- Een geaccepteerde, geplande (niet-asap) boeking waarbij de barber niet
-- binnen 60 minuten ná de afgesproken tijd op "Start rit" heeft gedrukt
-- (dus nog steeds status 'accepted' is) wordt automatisch geannuleerd:
-- de klant krijgt het volledige bedrag terug (incl. servicekosten — geen
-- annuleringskosten-logica hier, dit is niet de schuld van de klant), de
-- barber krijgt een waarschuwing. Bij een 2e waarschuwing wordt de
-- barber automatisch geschorst (barber_status = 'suspended', dezelfde
-- status als een handmatige admin-schorsing).
--
-- Zelfde opzet als trigger_expire_stale_requests (0019): een SQL-wrapper
-- + pg_cron-job die via pg_net een CRON_SECRET-beveiligde Route Handler
-- aanroept, want de Stripe-refund gebeurt met de Stripe SDK in JS.

-- ============================================================
-- barber_no_show_warnings — audit-trail per waarschuwing, dubbelt als
-- telling (aantal rijen voor deze barber) i.p.v. een apart mutable-
-- counter-veld op profiles/barber_profiles, zelfde "ledger i.p.v. losse
-- counter"-voorkeur als de wallet-architectuur (Fase 9).
-- ============================================================
create table public.barber_no_show_warnings (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index barber_no_show_warnings_barber_id_idx on public.barber_no_show_warnings (barber_id);

alter table public.barber_no_show_warnings enable row level security;

comment on table public.barber_no_show_warnings is
  'Eén rij per gemiste-afspraak-waarschuwing (zie /api/cron/expire-noshow-bookings). Geen insert/update/delete-grant voor authenticated, zelfde patroon als payments/disputes — alleen de service role (de cron-route) en het admin-panel (leest via service role) raken deze tabel aan.';

-- ============================================================
-- notify_customer_on_status_change (0007, uitgebreid in 0017/0019) —
-- de bestaande null-cancelled_by-tak was specifiek voor een onbeantwoorde
-- aanvraag (old.status = 'requested'). Zonder de old.status-check
-- hieronder zou een no-show-annulering (old.status = 'accepted') ook die
-- "niemand heeft binnen 30 minuten gereageerd"-tekst krijgen, wat hier
-- feitelijk onjuist is.
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

  -- Barber informeren als de klánt annuleert.
  if new.status = 'cancelled' and new.cancelled_by = 'customer' and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.barber_id, 'cancelled', 'Boeking geannuleerd', 'De klant heeft de boeking geannuleerd.', new.id);
  end if;

  -- Barber informeren als een directe aanvraag naar hem specifiek
  -- verloopt (alleen de oorspronkelijke onbeantwoorde-aanvraag-timeout —
  -- de no-show-waarschuwing zelf verstuurt /api/cron/expire-noshow-
  -- bookings apart, want die moet het aantal waarschuwingen tellen en
  -- eventueel schorsen, wat hier in een pure trigger niet netjes kan).
  if new.status = 'cancelled' and new.cancelled_by is null and old.status = 'requested' and new.barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (new.barber_id, 'cancelled', 'Aanvraag verlopen', 'Je hebt niet binnen 30 minuten gereageerd — de aanvraag is automatisch geannuleerd.', new.id);
  end if;

  return new;
end;
$$;

comment on function public.notify_customer_on_status_change() is
  'Dekt accepted/en_route/arrived/completed en cancelled in vier varianten (klant->barber, barber->klant, systeem-timeout-onbeantwoord->beide, systeem-no-show->klant). De no-show-barbermelding zelf komt niet hieruit maar uit /api/cron/expire-noshow-bookings.';

-- ============================================================
-- pg_cron-trigger — zelfde app_config/CRON_SECRET-opzet als
-- trigger_expire_stale_requests (0019)
-- ============================================================
create function public.trigger_expire_noshow_bookings()
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
    raise notice 'Expire-noshow-bookings overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/expire-noshow-bookings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_expire_noshow_bookings() is
  'Wrapper rond net.http_post() naar /api/cron/expire-noshow-bookings — handmatig te testen met `select public.trigger_expire_noshow_bookings();` in de SQL Editor.';

-- Elke 5 minuten is ruim genoeg voor een venster van 60 minuten (max.
-- ~5 min afwijking) zonder onnodig vaak te draaien — zelfde cadans als
-- expire-stale-requests-job.
select cron.schedule('expire-noshow-bookings-job', '*/5 * * * *', 'select public.trigger_expire_noshow_bookings();');
