-- Live gevonden (2026-10-06): na een geslaagde betaling bleef het
-- statusscherm "Betaal nu" tonen — payment_due_at werd nooit
-- teruggezet naar null zodra er daadwerkelijk betaald is, en
-- `paymentPending` (klant/status/page.tsx, klant/booking/[id].tsx)
-- checkt alleen `status = 'accepted' && !!paymentDueAt`, niet of er al
-- een payments-rij bestaat. Dit trof zowel het nieuwe 15-minuten-
-- venster (asap, prijs bevestigd, 0048) als het al langer bestaande
-- 24-uurs-venster voor geplande boekingen (0040) — simpelweg nooit
-- eerder opgemerkt.
--
-- Fix: een trigger op payments die, zodra er een rij wordt ingevoegd,
-- de bijbehorende boeking se payment_due_at terugzet naar null — de
-- deadline heeft dan toch geen betekenis meer. Generiek voor beide
-- gevallen, geen aparte asap/gepland-logica nodig.
create function public.clear_booking_payment_due_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings set payment_due_at = null where id = new.booking_id;
  return new;
end;
$$;

create trigger clear_payment_due_at_on_payment
  after insert on public.payments
  for each row
  execute function public.clear_booking_payment_due_at();

comment on function public.clear_booking_payment_due_at() is
  'Zet bookings.payment_due_at terug naar null zodra er een payments-rij voor die boeking ontstaat — zonder dit bleef paymentPending (klant/status, klant/booking/[id]) voor altijd true tonen, ook na een geslaagde betaling.';

-- Bestaande, al betaalde boekingen corrigeren (anders blijft dit
-- probleem voor hen bestaan totdat ze toevallig weer een
-- statusovergang krijgen).
update public.bookings b
set payment_due_at = null
where b.payment_due_at is not null
  and exists (select 1 from public.payments p where p.booking_id = b.id);
