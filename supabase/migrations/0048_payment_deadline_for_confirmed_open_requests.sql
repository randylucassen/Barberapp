-- Live gevonden (2026-10-06): een door de klant bevestigde
-- open-broadcast-aanvraag (price_pending -> accepted, "Akkoord, ga
-- naar betalen") bleef 4+ uur onbetaald op 'accepted' staan — de
-- betaalscherm-annulering-bij-terugnavigeren (klant/betaling.tsx,
-- klant/betaling/page.tsx) is de ENIGE bestaande bescherming hiertegen,
-- en die hangt aan React's unmount-cleanup: werkt bij een gewone
-- terugknop/swipe, maar niet gegarandeerd als het scherm nooit netjes
-- unmount (de app geforceerd afgesloten, een crash, een edge case die
-- nog niet bedacht is). Omdat zo'n vastzittende boeking de barber
-- blokkeert voor nieuwe aanvragen (barber_is_online_and_available()
-- sluit elke barber met een bestaande 'accepted'-boeking uit — zie
-- 0037), is dit geen onschuldige losse rij maar iets dat de hele
-- barber onbereikbaar maakt totdat iemand 'm handmatig opruimt.
--
-- Elke ANDERE tussenstap in deze flow heeft al een cron-vangnet
-- (expire-stale-requests voor een onbeantwoorde aanvraag,
-- expire-price-pending-requests voor een onbevestigde prijs,
-- expire-unpaid-scheduled-bookings voor een geplande boeking die niet
-- binnen 24u betaalt) — alleen "bevestigd maar nooit betaald" voor een
-- asap-aanvraag had er nog geen, want payment_due_at werd uitsluitend
-- gezet voor geplande (niet-asap) boekingen. Toegevoegd: dezelfde
-- payment_due_at-kolom, nu ook gezet bij price_pending -> accepted
-- (altijd asap, zie create_open_broadcast_request — price_pending
-- bestaat nooit voor een geplande boeking), met een veel kortere
-- termijn (15 minuten, past bij de urgentie van asap) dan de 24 uur
-- voor geplande boekingen. expire-unpaid-scheduled-bookings se query
-- is al generiek (status='accepted' and payment_due_at verstreken,
-- ongeacht requested_asap) — geen nieuwe cron nodig, alleen de trigger
-- uitgebreid.
create or replace function public.check_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.barber_id is distinct from old.barber_id then
    if old.barber_id is null and new.barber_id = auth.uid()
       and old.status = 'requested' and new.status in ('accepted', 'price_pending') then
      return new;
    end if;
    if old.barber_id is not null and new.barber_id is null
       and old.status = 'price_pending' and new.status = 'requested'
       and auth.uid() = old.customer_id then
      return new;
    end if;
    raise exception 'barber_id mag alleen gezet worden door een openstaande aanvraag te claimen, of teruggezet door de klant via decline_price_and_reopen';
  end if;

  if auth.uid() = old.customer_id then
    v_actor := 'customer';
  elsif auth.uid() = old.barber_id then
    v_actor := 'barber';
  else
    raise exception 'Alleen de klant of de barber van deze boeking mag de status wijzigen';
  end if;

  if v_actor = 'barber' then
    if not (
      (old.status = 'requested' and new.status in ('accepted', 'cancelled')) or
      (old.status = 'price_pending' and new.status = 'cancelled') or
      (old.status = 'accepted' and new.status in ('en_route', 'cancelled')) or
      (old.status = 'en_route' and new.status in ('arrived', 'cancelled')) or
      (old.status = 'arrived' and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'completed')
    ) then
      raise exception 'Ongeldige statusovergang voor barber: % -> %', old.status, new.status;
    end if;

    if old.status = 'accepted' and new.status = 'en_route'
       and not public.booking_has_payment(new.id) then
      raise exception 'Nog niet betaald — kan nog niet van start';
    end if;
  else
    if not (
      (old.status in ('requested', 'accepted', 'en_route') and new.status = 'cancelled') or
      (old.status = 'price_pending' and new.status in ('accepted', 'requested', 'cancelled'))
    ) then
      raise exception 'Ongeldige statusovergang voor klant: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'cancelled' and new.cancelled_by is distinct from v_actor then
    raise exception 'cancelled_by moet overeenkomen met wie de boeking annuleert';
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at = now();
  end if;

  if new.status = 'accepted' and old.status = 'requested'
     and not new.requested_asap
     and not public.booking_has_payment(new.id) then
    new.payment_due_at = now() + interval '24 hours';
  end if;

  if new.status = 'accepted' and old.status = 'price_pending'
     and not public.booking_has_payment(new.id) then
    new.payment_due_at = now() + interval '15 minutes';
  end if;

  return new;
end;
$$;

comment on column public.bookings.payment_due_at is
  'Deadline om te betalen vóórdat expire-unpaid-scheduled-bookings de boeking annuleert. Gezet in twee gevallen (check_booking_status_transition): 24u voor een geplande (niet-asap) boeking direct bij acceptatie (0040), 15 min voor een asap open-broadcast-aanvraag zodra de klant de prijs bevestigt (price_pending -> accepted, 0048) — die laatste is het vangnet áchter de betaalscherm-annulering-bij-terugnavigeren, voor als die om wat voor reden dan ook niet afgaat.';
