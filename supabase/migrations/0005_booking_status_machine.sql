-- Fase 4: (1) dwingt geldige boekingsstatus-overgangen af op databaseniveau,
-- (2) een view zodat klanten de naam van approved barbers kunnen zien bij
-- het kiezen van een barber, (3) een functie zodat een barber de naam kan
-- zien van de klant achter zijn eigen boekingen (profiles.full_name is
-- anders niet zichtbaar voor andere gebruikers — RLS staat alleen de
-- eigen rij toe).
-- Voer uit ná 0001-0004.

-- ============================================================
-- approved_barbers — view voor de klant-facing barberslijst
-- ============================================================
-- `security_invoker = false` (de Postgres-default, hier expliciet gezet
-- omdat het security-kritiek is): de view draait met de rechten van de
-- eigenaar (die profiles/barber_profiles wél volledig mag lezen), maar
-- geeft alléén de expliciet geselecteerde, veilige kolommen door — nooit
-- e-mail/telefoon. Dit is bewust een view i.p.v. de RLS van `profiles` te
-- verruimen, wat élke kolom (incl. e-mail/telefoon) van andere gebruikers
-- zichtbaar zou maken.
create view public.approved_barbers with (security_invoker = false) as
select
  p.id,
  p.full_name,
  bp.city,
  bp.work_area_km,
  bp.avatar_url,
  bp.bio,
  bp.rating_avg,
  bp.rating_count
from public.profiles p
join public.barber_profiles bp on bp.id = p.id
where p.barber_status = 'approved';

grant select on public.approved_barbers to authenticated;

-- ============================================================
-- get_booking_customer_name — laat een barber de naam van zijn eigen
-- klant zien, zonder profiles-RLS te verruimen. Alleen bruikbaar voor de
-- boeking waar de aanroeper zelf de toegewezen barber van is.
-- ============================================================
create function public.get_booking_customer_name(p_booking_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.full_name
  from public.bookings b
  join public.profiles p on p.id = b.customer_id
  where b.id = p_booking_id
    and b.barber_id = auth.uid();
$$;

grant execute on function public.get_booking_customer_name(uuid) to authenticated;

create function public.check_booking_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.user_role;
begin
  -- auth.uid() is null bij een service-role/backend-context (bv. een
  -- toekomstig adminpanel, Fase 10) — die is al vertrouwd, geen extra
  -- overgangscontrole nodig. Voor gewone gebruikers geldt de check hieronder.
  if auth.uid() is null then
    return new;
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
      (old.status = 'accepted' and new.status in ('en_route', 'cancelled')) or
      (old.status = 'en_route' and new.status in ('arrived', 'cancelled')) or
      (old.status = 'arrived' and new.status = 'in_progress') or
      (old.status = 'in_progress' and new.status = 'completed')
    ) then
      raise exception 'Ongeldige statusovergang voor barber: % -> %', old.status, new.status;
    end if;
  else
    if not (
      old.status in ('requested', 'accepted', 'en_route') and new.status = 'cancelled'
    ) then
      raise exception 'Ongeldige statusovergang voor klant: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'cancelled' and new.cancelled_by is distinct from v_actor then
    raise exception 'cancelled_by moet overeenkomen met wie de boeking annuleert';
  end if;

  return new;
end;
$$;

create trigger check_booking_status_transition_trigger
  before update on public.bookings
  for each row
  when (new.status is distinct from old.status)
  execute procedure public.check_booking_status_transition();

comment on function public.check_booking_status_transition() is
  'Statusmachine voor bookings: requested->accepted->en_route->arrived->in_progress->completed (alleen barber), met cancelled als escape-hatch vanaf requested/accepted/en_route (klant of barber). Klant kan nooit in_progress/completed/etc. zelf zetten, ook niet via een directe API-call.';
