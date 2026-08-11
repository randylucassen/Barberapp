-- Fix voor 0009: de nieuwe barber-zichtbaarheidspolicies op bookings
-- controleren "bestaat er een payments-rij voor deze boeking" via een
-- rechtstreekse subquery op payments. Maar payments' eigen SELECT-policy
-- ("Participants can view own payment", 0003) doet exact het omgekeerde —
-- controleert of de aanroeper customer_id/barber_id is via een subquery op
-- bookings. Twee tabellen die elkaars RLS-policy bevragen levert
-- oneindige recursie op (42P17), precies het patroon uit CLAUDE.md-regel
-- 10 (RLS-policy die tegen een andere RLS-beveiligde tabel subquery't).
--
-- Fix: dezelfde security-definer-boolean-functie-truc als
-- is_approved_barber()/barber_is_online_and_available() — een functie
-- die van binnenuit RLS op payments omzeilt, zodat de cirkel op één kant
-- doorbroken wordt. payments' eigen policy blijft ongewijzigd; die query't
-- straks alleen nog de bookings-kant, en de bookings-policies query'en de
-- payments-kant niet meer rechtstreeks.

create function public.booking_has_payment(p_booking_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.payments p where p.booking_id = p_booking_id);
$$;

comment on function public.booking_has_payment(uuid) is
  'Bypass voor de RLS-recursie tussen bookings en payments (zie migratie-comment) — geeft alleen een boolean terug, nooit de rij zelf.';

grant execute on function public.booking_has_payment(uuid) to authenticated;

drop policy "Assigned barbers can view paid bookings" on public.bookings;
create policy "Assigned barbers can view paid bookings"
  on public.bookings for select
  using (auth.uid() = barber_id and public.booking_has_payment(bookings.id));

drop policy "Assigned barbers can update paid bookings" on public.bookings;
create policy "Assigned barbers can update paid bookings"
  on public.bookings for update
  using (auth.uid() = barber_id and public.booking_has_payment(bookings.id));

drop policy "Barbers can view paid open requests within their radius" on public.bookings;
create policy "Barbers can view paid open requests within their radius"
  on public.bookings for select
  using (
    barber_id is null
    and status = 'requested'
    and public.booking_has_payment(bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and exists (
      select 1
      from public.barber_profiles bp
      join public.services s on s.barber_id = bp.id
      where bp.id = auth.uid()
        and bp.lat is not null and bp.lng is not null
        and bookings.lat is not null and bookings.lng is not null
        and s.name = bookings.service_name_snapshot
        and s.active
        and public.haversine_km(bp.lat, bp.lng, bookings.lat, bookings.lng) <= bp.work_area_km
    )
  );

drop policy "Barbers can claim paid open requests within their radius" on public.bookings;
create policy "Barbers can claim paid open requests within their radius"
  on public.bookings for update
  using (
    barber_id is null
    and status = 'requested'
    and public.booking_has_payment(bookings.id)
    and public.barber_is_online_and_available(auth.uid())
    and exists (
      select 1
      from public.barber_profiles bp
      join public.services s on s.barber_id = bp.id
      where bp.id = auth.uid()
        and bp.lat is not null and bp.lng is not null
        and bookings.lat is not null and bookings.lng is not null
        and s.name = bookings.service_name_snapshot
        and s.active
        and public.haversine_km(bp.lat, bp.lng, bookings.lat, bookings.lng) <= bp.work_area_km
    )
  )
  with check (barber_id = auth.uid());
