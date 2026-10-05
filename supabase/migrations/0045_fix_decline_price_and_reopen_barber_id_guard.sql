-- Live geverifieerd na 0043/0044 en nog een gat gevonden:
-- check_booking_status_transition()'s barber_id-wijzig-guard had maar
-- één bypass (claimen: barber_id null -> auth.uid(), requested ->
-- accepted/price_pending) — elke ANDERE wijziging van barber_id,
-- inclusief 'm terug op null zetten, werd onvoorwaardelijk geweigerd.
-- decline_price_and_reopen() (0043) doet precies dat (barber_id ->
-- null, price_pending -> requested) en liep daardoor altijd vast op
-- "barber_id mag alleen gezet worden door een openstaande aanvraag te
-- claimen" — live bevestigd: declinen was voor geen enkele klant ooit
-- mogelijk. Toevoeging: een tweede bypass voor exact de velden die
-- decline_price_and_reopen() zet, door de klant zelf.
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

  return new;
end;
$$;
