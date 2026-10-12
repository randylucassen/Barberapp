-- Op verzoek: een klant kan nu alleen een geschil openen als de
-- boeking `completed` is (binnen 24u, 0009) — maar arrived/in_progress
-- kende tot nu toe GEEN enkele klant-zichtbare uitweg als een barber
-- daar vastloopt (bv. telefoon verliest na "Ik ben er"). De enige
-- bestaande herstelroute was admin-only (getStuckBookingsForAdmin(),
-- /api/admin/bookings/force-resolve). Dit voegt een klant-zichtbare
-- uitweg toe: na 2 uur vast op arrived/in_progress mag de klant ook
-- een geschil openen, die dan in dezelfde admin-geschillenwachtrij
-- terechtkomt en met dezelfde refund/vrijgeven-afhandeling wordt
-- opgelost — geen nieuw resolutiemechanisme nodig.
--
-- `updated_at` als peildatum (door de generieke set_updated_at()-
-- trigger, 0001/0003, al bij elke statusovergang bijgewerkt) — zelfde
-- aanname als de nieuwe ASAP-no-show-cron (0063): betrouwbaar "moment
-- van binnenkomst in deze status" zolang er niets anders aan de rij
-- verandert zolang de boeking erin vastzit.
drop policy "Customers can open a dispute within 24h of completion" on public.disputes;

create policy "Customers can open a dispute within 24h, or when stuck"
  on public.disputes for insert
  with check (
    auth.uid() = opened_by
    and exists (
      select 1 from public.bookings b
      where b.id = disputes.booking_id
        and b.customer_id = auth.uid()
        and (
          (b.status = 'completed' and b.completed_at is not null and now() <= b.completed_at + interval '24 hours')
          or (b.status in ('arrived', 'in_progress') and now() >= b.updated_at + interval '2 hours')
        )
    )
  );

comment on policy "Customers can open a dispute within 24h, or when stuck" on public.disputes is
  'Twee gevallen: binnen 24u na completed (ongewijzigd, 0009), of nog steeds arrived/in_progress na 2+ uur (nieuw — de enige klant-zichtbare uitweg voor een vastgelopen boeking, naast de bestaande admin-only force-resolve-route).';
