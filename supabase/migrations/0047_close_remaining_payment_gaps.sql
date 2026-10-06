-- Twee bevindingen uit een volledige audit van elke route die een
-- boeking richting "bevestigd"/verder kan duwen (gevraagd door de
-- gebruiker na drie eerdere live-gevonden betaal-bypass-bugs in
-- dezelfde ronde, 0044/0046). Geen van beide is een actief misbruikt
-- gat, maar allebei verdienden het dichtgezet te worden.

-- ============================================================
-- 1. Expliciete WITH CHECK op "Customers can update own bookings"
-- ============================================================
-- De policy had alleen een USING (auth.uid() = customer_id) — geen
-- enkele andere beperking op RLS-niveau. In de praktijk is dit nu
-- alleen veilig omdat prijsvelden (price_cents_snapshot,
-- duration_minutes_snapshot, service_name_snapshot, customer_id, etc.)
-- geen UPDATE-grant hebben voor authenticated — een klant kan dus niet
-- zelf de prijs aanpassen, ook niet via een rechtstreekse REST-call.
-- Maar dat is een stilzwijgende aanname (afwezigheid van een grant),
-- niet een expliciete regel — een toekomstige migratie die per ongeluk
-- een grant op zo'n kolom toevoegt, breekt dit zonder dat deze policy
-- zelf iets zegt. Expliciete WITH CHECK toegevoegd, identiek aan de
-- USING-voorwaarde, zodat de bedoeling hier leesbaar vastligt.
drop policy "Customers can update own bookings" on public.bookings;
create policy "Customers can update own bookings"
  on public.bookings for update
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

-- ============================================================
-- 2. Geplande (niet-asap) boekingen konden de hele rit rijden zonder
--    ooit betaald te zijn
-- ============================================================
-- check_booking_status_transition() (laatst gewijzigd 0046) valideert
-- alleen de VORM van een statusovergang, nooit of er betaald is — die
-- eis zat uitsluitend in de "Assigned barbers can update ..."-RLS-
-- policy, en daar geldt 'm met opzet niet voor geplande boekingen
-- (`not requested_asap`, 0040: "betalen pas ná acceptatie, binnen 24
-- uur"). Gevolg: een barber kon een geplande boeking volledig rijden
-- (accepted -> en_route -> arrived -> in_progress -> completed) vóórdat
-- de 24-uurs-deadline verstreek, zonder dat er ooit een payments-rij
-- bestond — en expire-unpaid-scheduled-bookings vangt dat niet op,
-- want die query matcht alleen nog `status = 'accepted'`, niet een
-- boeking die intussen al verder is.
--
-- Fix: het daadwerkelijke vertrekmoment (accepted -> en_route) vereist
-- nu alsnog een bestaande betaling, voor ELKE boeking — niet meer
-- alleen voor asap. Het 24-uurs-betaalvenster blijft volledig intact
-- (de klant kan gewoon wanneer dan ook vóór het afgesproken tijdstip
-- betalen); het enige verschil is dat de barber niet meer kan vertrekken
-- vóórdat die betaling er daadwerkelijk is — exact hetzelfde principe
-- als bij asap, nu consistent toegepast. Annuleren blijft op elk moment
-- mogelijk, ongeacht betaalstatus (new.status = 'en_route' is de enige
-- nieuwe voorwaarde hieronder, een cancel raakt dit niet).
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

  return new;
end;
$$;
