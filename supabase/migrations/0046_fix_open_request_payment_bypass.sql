-- Live gevonden: een boeking die via de open-broadcast-aanvraag (0042/
-- 0043) geclaimd en door de klant bevestigd was, kon door de barber
-- helemaal tot 'completed' doorgereden worden ZONDER ooit betaald te
-- zijn — bevestigd via een echte boeking van de gebruiker
-- (status='completed', wél een price_cents_snapshot, maar nul rijen
-- in payments).
--
-- Root cause: de "Assigned barbers can update ..."-policy (0040) had
-- vóór 0042 altijd onverkort `booking_has_payment(..) or not
-- requested_asap` als voorwaarde voor een asap-boeking (zie 0040's
-- eigen comment: "de betaal-gate blijft wél onverkort gelden voor
-- asap-boekingen"). 0042/0043 voegde daar `or bookings.open_request`
-- aan toe als derde, ALTIJD-ware optie — maar `open_request` blijft
-- voor altijd `true` op zo'n boeking (bewust, puur een historisch
-- label, zie create_open_broadcast_request's comment), dus deze
-- bypass gold daarmee niet alleen voor het claimen zelf maar voor
-- IEDERE latere statusovergang (accepted -> en_route -> ... ->
-- completed) — de betaal-gate was voor dit hele pad dus permanent
-- uitgeschakeld, niet alleen tijdens het claimen.
--
-- De bypass is alleen echt nodig zolang de boeking nog in
-- price_pending staat (de klant heeft dan nog niet eens bevestigd,
-- dus er kan nog geen betaling bestaan) — de enige actie die een
-- barber daar via deze policy op onderneemt is annuleren
-- (check_booking_status_transition: price_pending -> cancelled).
-- Zodra de klant bevestigt (-> accepted) moet de oorspronkelijke,
-- onverkorte betaal-eis weer gelden, exact zoals voor elke andere
-- asap-boeking.
drop policy "Assigned barbers can update paid, pending-payment, or open bookings" on public.bookings;
create policy "Assigned barbers can update paid, pending-payment, or claimable-open bookings"
  on public.bookings for update
  using (
    auth.uid() = barber_id
    and (
      public.booking_has_payment(bookings.id)
      or not bookings.requested_asap
      or (bookings.open_request and bookings.status = 'price_pending')
    )
  );
