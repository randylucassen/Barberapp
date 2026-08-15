-- Een barber kreeg nooit een melding als een klant een review achterliet
-- — update_barber_rating() (0003) werkte alleen de rating_avg/
-- rating_count-cache bij, geen notificatie. Zelfde fan-out-patroon als de
-- andere notify_*-triggers (notificaties-rij, opgepikt door de bestaande
-- /api/notifications/send-trigger uit 0013).

alter type public.notification_type add value 'review_received';

-- create or replace vervangt de hele functiebody (regel 22 CLAUDE.md) —
-- dit is de volledige 0003-body met alleen de insert erbij.
create or replace function public.update_barber_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.barber_profiles
  set
    rating_avg = round(
      (((coalesce(rating_avg, 0) * rating_count) + new.stars)::numeric / (rating_count + 1)), 1
    ),
    rating_count = rating_count + 1
  where id = new.barber_id;

  insert into public.notifications (user_id, type, title, body, related_booking_id)
  values (
    new.barber_id,
    'review_received',
    'Nieuwe review ontvangen',
    new.stars || ' ster' || (case when new.stars = 1 then '' else 'ren' end)
      || (case when new.text is not null and new.text <> '' then ': "' || new.text || '"' else '' end),
    new.booking_id
  );

  return new;
end;
$$;

comment on function public.update_barber_rating() is
  'Houdt barber_profiles.rating_avg/rating_count bij én stuurt sinds 0032 een review_received-notificatie naar de barber (zelfde fan-out-patroon als de andere notify_*-triggers).';
