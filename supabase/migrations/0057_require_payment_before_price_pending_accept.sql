-- Dit "een onbetaalde open-broadcast-aanvraag oogt al goedgekeurd"-
-- probleem is twee keer achter elkaar alleen aan de clientkant
-- gefixt (eerst een UI-badge, 2026-10-10, daarna het weghalen van de
-- vroegtijdige `.update({status:'accepted'})` in handleConfirmPrice,
-- zelfde dag) — de gebruiker wees er terecht op dat dit al vaker
-- "opgelost" leek. Reden dat het bleef terugkomen: de database liet
-- (en laat zonder deze migratie nog steeds) een klant-sessie gewoon
-- rechtstreeks price_pending -> accepted zetten, betaald of niet —
-- `check_booking_status_transition()`'s klant-tak stond die overgang
-- altijd al toe. Elke toekomstige client-bug (een nieuwe knop, een
-- verkeerd teruggezette wijziging, een rechtstreekse REST-call) kon
-- dus opnieuw hetzelfde gat openen, ongeacht hoe netjes de UI-code op
-- dat moment is. Deze migratie sluit het gat op de enige plek die
-- blijvend is: de database staat de overgang voortaan alleen nog toe
-- als er al een betaling bestaat — exact hetzelfde patroon als de
-- barber-kant z'n `accepted -> en_route`-guard hieronder (0047).
--
-- Service-role-updates (de webhook/confirm-payment-route, via
-- recordSucceededPaymentIntent()) blijven ongemoeid: die lopen via de
-- `auth.uid() is null`-bypass bovenaan deze functie, dus de nieuwe
-- guard raakt ze nooit — dat is en blijft de enige legitieme weg om
-- price_pending naar accepted te zetten.
--
-- Bijkomend: de 15-minuten payment_due_at-tak uit 0048 (price_pending
-- -> accepted zonder bestaande betaling) is hierdoor volledig
-- onbereikbaar geworden — niemand kan die overgang meer zonder
-- betaling triggeren, dus de tak vuurde toch al nooit meer. Opgeruimd
-- i.p.v. inert laten staan, om een toekomstige lezer niet te laten
-- denken dat er nog een 15-minuten-coulance bestaat.
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

    -- De kern van deze migratie: een klant-sessie mag price_pending
    -- alleen naar accepted zetten als er al daadwerkelijk betaald is.
    -- Dit is de blijvende, database-niveau-versie van wat voorheen
    -- alleen door client-code-discipline werd afgedwongen.
    if old.status = 'price_pending' and new.status = 'accepted'
       and not public.booking_has_payment(new.id) then
      raise exception 'Nog niet betaald — kan nog niet geaccepteerd worden';
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

comment on column public.bookings.payment_due_at is
  'Deadline om te betalen vóórdat expire-unpaid-scheduled-bookings de boeking annuleert. Sinds 0057 alleen nog gezet voor een geplande (niet-asap) boeking direct bij acceptatie door de barber (24u, 0040). Een asap open-broadcast-aanvraag (price_pending) heeft dit niet meer nodig: die kan de klant-kant sowieso niet meer naar accepted zetten zonder eerst te betalen (zie check_booking_status_transition), dus er is nooit een onbetaalde accepted-status om een deadline op te zetten.';
