-- Herinnering voor de barber 1 uur voor een geplande (niet-asap)
-- afspraak — onderdeel van "geplande boekingen niet als 'nu' behandelen"
-- (zie CLAUDE.md-changelog). Zelfde opzet als trigger_review_reminders()
-- (0013): puur SQL, rechtstreeks via pg_cron, geen aparte API-route nodig
-- — de bestaande fan_out_notification-trigger op notifications-inserts
-- verzorgt de daadwerkelijke push/e-mail-verzending al.

alter type public.notification_type add value 'booking_reminder';

create function public.trigger_booking_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
begin
  for v_booking in
    select b.id, b.barber_id, b.service_name_snapshot, b.scheduled_at
    from public.bookings b
    where b.status = 'accepted'
      and b.requested_asap = false
      and b.scheduled_at is not null
      and b.scheduled_at between now() + interval '55 minutes' and now() + interval '65 minutes'
      and not exists (
        select 1 from public.notifications n
        where n.related_booking_id = b.id and n.type = 'booking_reminder'
      )
  loop
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      v_booking.barber_id,
      'booking_reminder',
      'Afspraak over een uur',
      v_booking.service_name_snapshot || ' om ' ||
        to_char(v_booking.scheduled_at at time zone 'Europe/Amsterdam', 'HH24:MI') || ' uur.',
      v_booking.id
    );
  end loop;
end;
$$;

comment on function public.trigger_booking_reminders() is
  'Handmatig te testen met `select public.trigger_booking_reminders();` in de SQL Editor. Venster 55-65 min t.o.v. scheduled_at, elke 5 min gecheckt — ruime marge tegen een gemiste cron-tick. Dedup via notifications.type=''booking_reminder'', geen aparte kolom op bookings nodig.';

select cron.schedule('booking-reminders-job', '*/5 * * * *', 'select public.trigger_booking_reminders();');
