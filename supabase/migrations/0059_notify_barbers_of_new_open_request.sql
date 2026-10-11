-- Gevraagd door de gebruiker: barbers kregen tot nu toe GEEN melding bij
-- een nieuwe open_request-aanvraag (0042/0043) — alleen bij een directe
-- toewijzing (new_request, 0013, expliciet beperkt tot "barber_id al
-- gezet op het moment van betalen", broadcast-fan-out toen bewust
-- uitgesteld als "duidelijk grotere klus met beperkte MVP-waarde").
-- Nu relevanter dan ooit: sinds vandaag gaat ELKE "Snelste beschikbare
-- barber"-aanvraag (ASAP) via open_request (geen vooraf-match meer,
-- zie de CLAUDE.md-sectie hierover) — barbers zagen zo'n aanvraag dus
-- tot nu toe alleen via de 5s-dashboard-poll, geen enkele pushmelding.
--
-- Fan-out naar alle op dit moment geschikte barbers: zelfde matching-
-- voorwaarden als barber_is_online_and_available() (herbruikt, neemt
-- expliciet een p_barber_id-parameter, niet auth.uid()-gebonden) en
-- barber_matches_location_and_service()'s open_request-tak (die WEL
-- hardcoded auth.uid() gebruikt, dus hier bewust herhaald — zelfde
-- "expliciete herhaling"-precedent als migratie 0044). Elke insert in
-- notifications triggert vanzelf fan_out_notification() (0013) —
-- e-mail/web-push/Expo-push, geen aparte dispatch-code nodig hier.
--
-- Sluit ook declined_barber_ids uit (0058) — zonder die check zou een
-- barber die net een prijs liet weigeren meteen weer een "nieuwe
-- aanvraag"-melding krijgen voor exact de aanvraag die hij niet meer
-- mag claimen.
--
-- Twee triggers (zelfde functie): INSERT (een gloednieuwe aanvraag) en
-- UPDATE (een price_pending-claim die terugvalt naar requested — klant
-- weigerde de prijs, of een cron-timeout — de aanvraag is dan opnieuw
-- "vrij te claimen", verdient dus ook opnieuw een melding). OLD bestaat
-- niet bij INSERT, vandaar twee aparte triggers i.p.v. één gecombineerde
-- met een OLD-check in de WHEN-clause.
create function public.notify_barbers_of_open_request(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_services jsonb;
  v_declined uuid[];
  v_barber_id uuid;
begin
  select lat, lng, requested_services, declined_barber_ids
  into v_lat, v_lng, v_services, v_declined
  from public.bookings
  where id = p_booking_id;

  if v_lat is null or v_lng is null or v_services is null then
    return;
  end if;

  for v_barber_id in
    select bp.id
    from public.barber_profiles bp
    where public.barber_is_online_and_available(bp.id)
      and not (bp.id = any(coalesce(v_declined, '{}')))
      and bp.lat is not null and bp.lng is not null
      and public.haversine_km(bp.lat, bp.lng, v_lat, v_lng) <= bp.work_area_km
      and not exists (
        select 1 from jsonb_array_elements(v_services) line
        where not exists (
          select 1 from public.services s
          where s.barber_id = bp.id and s.name = line ->> 'name' and s.active
        )
      )
  loop
    insert into public.notifications (user_id, type, title, body, related_booking_id)
    values (
      v_barber_id,
      'new_request',
      'Nieuwe aanvraag in de buurt',
      'Wees er snel bij voordat een andere barber ''m claimt.',
      p_booking_id
    );
  end loop;
end;
$$;

comment on function public.notify_barbers_of_open_request(uuid) is
  'Stuurt een new_request-notificatie (fan-out via fan_out_notification(), 0013) naar elke op dit moment geschikte barber (online, beschikbaar, binnen straal, biedt alle gevraagde diensten) voor een open_request-aanvraag — aangeroepen door de insert/update-triggers hieronder, zelf geen trigger-functie (zodat ''m ook los getest kan worden).';

create function public.trigger_notify_barbers_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_barbers_of_open_request(new.id);
  return new;
end;
$$;

create trigger notify_barbers_on_new_open_request
  after insert on public.bookings
  for each row
  when (new.open_request and new.barber_id is null and new.status = 'requested')
  execute function public.trigger_notify_barbers_on_insert();

create function public.trigger_notify_barbers_on_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_barbers_of_open_request(new.id);
  return new;
end;
$$;

create trigger notify_barbers_on_reopened_request
  after update on public.bookings
  for each row
  when (
    new.open_request and new.barber_id is null and new.status = 'requested'
    and old.status is distinct from 'requested'
  )
  execute function public.trigger_notify_barbers_on_reopen();

comment on trigger notify_barbers_on_new_open_request on public.bookings is
  'Nieuwe open_request-aanvraag (create_open_broadcast_request) — meld alle nu geschikte barbers.';
comment on trigger notify_barbers_on_reopened_request on public.bookings is
  'Een price_pending-claim valt terug naar requested (decline_price_and_reopen, of de cron-timeout) — opnieuw vrij te claimen, dus opnieuw meldenswaardig.';
