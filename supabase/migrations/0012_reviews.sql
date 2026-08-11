-- Fase 7: koppelt de al bestaande reviews-tabel/RLS/rating-trigger (sinds
-- Fase 2, nooit aangeroepen) aan echte UI. Twee aanvullingen op het
-- bestaande schema:
--
-- 1. De insert-policy uit 0003 valideert wel booking_id/customer_id/
--    status, maar niet dat de meegestuurde barber_id ook echt bij die
--    boeking hoort — een client zou in theorie een ander barber_id
--    kunnen meesturen. Vervangen door een striktere versie.
-- 2. get_barber_reviews(): dezelfde security-definer-truc als
--    get_booking_customer_name() (Fase 4) — reviews zelf zijn al publiek
--    leesbaar (using (true), ongewijzigd sinds Fase 2), maar de naam van
--    de reviewer joinen vanuit profiles loopt anders tegen profiles'
--    eigen "alleen eigen rij"-RLS aan voor iedereen behalve de reviewer.

drop policy if exists "Customers can review own completed bookings" on public.reviews;

create policy "Customers can review own completed bookings"
  on public.reviews for insert
  with check (
    auth.uid() = customer_id
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.customer_id = auth.uid()
        and b.status = 'completed'
        and b.barber_id = reviews.barber_id
    )
  );

create function public.get_barber_reviews(p_barber_id uuid)
returns table (
  id uuid,
  stars smallint,
  text text,
  created_at timestamptz,
  reviewer_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.stars, r.text, r.created_at, p.full_name
  from public.reviews r
  join public.profiles p on p.id = r.customer_id
  where r.barber_id = p_barber_id
  order by r.created_at desc;
$$;

comment on function public.get_barber_reviews(uuid) is
  'Geeft de reviewer-naam mee zonder profiles-RLS te verruimen (zelfde patroon als get_booking_customer_name, Fase 4) — reviews zelf waren al publiek leesbaar (using (true), Fase 2), alleen de naam-join vereiste dit.';

grant execute on function public.get_barber_reviews(uuid) to authenticated;
