-- Fase 8: koppelt de al sinds Fase 2 bestaande notifications-tabel/enum
-- (7 waarden, nooit allemaal gevuld) aan echte e-mail + push. Patroon:
-- elke gebeurtenis blijft alleen een rij in notifications inserten (zoals
-- nu al met accepted/en_route/arrived, Fase 5) — één centrale
-- fan_out_notification-trigger op notifications zelf is het enige punt
-- dat via pg_net een POST doet naar /api/notifications/send (zelfde
-- app_config/CRON_SECRET-opzet als trigger_escrow_release, Fase 6).

-- ============================================================
-- Voorkeuren + push-subscriptions
-- ============================================================

alter table public.profiles add column email_notifications_enabled boolean not null default true;

grant update (email_notifications_enabled) on public.profiles to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Eén rij per browser/device-inschrijving voor Web Push. Rechtstreeks client-insert/delete (RLS: alleen eigen rijen) — geen aparte Route Handler nodig, zelfde patroon als customer_profiles.';

alter table public.push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

-- ============================================================
-- payment_received (klant) + new_request (barber, alleen bij directe
-- toewijzing — zie migratie-comment/PROJECT.md voor de scope-afbakening
-- rond broadcast-aanvragen)
-- ============================================================

create function public.notify_on_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_barber_id uuid;
  v_service text;
  v_address text;
begin
  select customer_id, barber_id, service_name_snapshot, address
  into v_customer_id, v_barber_id, v_service, v_address
  from public.bookings
  where id = new.booking_id;

  insert into public.notifications (user_id, type, title, body, related_booking_id)
  values (
    v_customer_id,
    'payment_received',
    'Betaling ontvangen',
    'Je betaling voor ' || v_service || ' staat veilig vast tot na afloop.',
    new.booking_id
  );

  if v_barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      v_barber_id,
      'new_request',
      'Nieuwe aanvraag',
      v_service || ' · ' || v_address,
      new.booking_id
    );
  end if;

  return new;
end;
$$;

comment on function public.notify_on_payment_received() is
  'new_request dekt bewust alleen rechtstreekse toewijzing (barber_id al gezet op het moment van betalen) — een broadcast-aanvraag zou een fan-out naar alle in aanmerking komende barbers vereisen (dezelfde straal/beschikbaarheid-matching als 0007), een duidelijk grotere klus met beperkte MVP-waarde bovenop de bestaande dashboard-polling.';

create trigger on_payment_created_notify
  after insert on public.payments
  for each row execute procedure public.notify_on_payment_received();

-- ============================================================
-- dispute (barber)
-- ============================================================

create function public.notify_on_dispute_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barber_id uuid;
  v_service text;
begin
  select barber_id, service_name_snapshot into v_barber_id, v_service
  from public.bookings
  where id = new.booking_id;

  if v_barber_id is not null then
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      v_barber_id,
      'dispute',
      'Klant heeft een probleem gemeld',
      coalesce(v_service, 'Een boeking') || ': "' || new.reason || '"',
      new.booking_id
    );
  end if;

  return new;
end;
$$;

create trigger on_dispute_created_notify
  after insert on public.disputes
  for each row execute procedure public.notify_on_dispute_opened();

-- ============================================================
-- Centraal inzendpunt: elke notificatie-insert (ongeacht bron) vuurt de
-- echte e-mail/push af via /api/notifications/send
-- ============================================================

create function public.fan_out_notification()
returns trigger
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

  if v_url is null or v_url like 'VUL-HIER%' or v_secret is null or v_secret like 'VUL-HIER%' then
    raise notice 'Notificatie-fan-out overgeslagen: app_config nog niet volledig ingesteld.';
    return new;
  end if;

  perform net.http_post(
    url := v_url || '/api/notifications/send',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('notificationId', new.id)
  );

  return new;
end;
$$;

comment on function public.fan_out_notification() is
  'Enige integratiepunt met e-mail/push — elke bron (bestaande accepted/en_route/arrived-trigger uit Fase 5, de nieuwe payment/dispute-triggers hierboven, de review-reminder-cron hieronder) hoeft alleen een rij in notifications te inserten. Zelfde app_config/CRON_SECRET-patroon als trigger_escrow_release (Fase 6) — slaat zichzelf net zo over zolang er nog geen echte deploy-URL is.';

create trigger on_notification_created_fan_out
  after insert on public.notifications
  for each row execute procedure public.fan_out_notification();

-- ============================================================
-- review_reminder — pg_cron, zelfde opzet als trigger_escrow_release
-- ============================================================

create function public.trigger_review_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
begin
  for v_booking in
    select b.id, b.customer_id, b.service_name_snapshot
    from public.bookings b
    where b.status = 'completed'
      and b.completed_at is not null
      and b.completed_at <= now() - interval '24 hours'
      and not exists (select 1 from public.reviews r where r.booking_id = b.id)
      and not exists (
        select 1 from public.notifications n
        where n.related_booking_id = b.id and n.type = 'review_reminder'
      )
  loop
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      v_booking.customer_id,
      'review_reminder',
      'Hoe was je knipbeurt?',
      'Laat een review achter voor ' || v_booking.service_name_snapshot || '.',
      v_booking.id
    );
  end loop;
end;
$$;

comment on function public.trigger_review_reminders() is
  'Handmatig te testen met `select public.trigger_review_reminders();` in de SQL Editor, i.p.v. te wachten op de cron of curl te gebruiken.';

select cron.schedule('review-reminders-job', '0 * * * *', 'select public.trigger_review_reminders();');
