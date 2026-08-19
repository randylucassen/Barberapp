-- Een barber die uitlogt of de app gewoon dichtklikt zonder de "Online"-
-- schakelaar zelf om te zetten, bleef `is_online = true` staan — de klant
-- kreeg dan nooit de al bestaande offline-waarschuwing op klant/boeking,
-- ook al was de barber allang niet meer bereikbaar. `is_online` is en
-- blijft een expliciete schakelaar, maar telt vanaf nu alleen mee als de
-- barber-app ook daadwerkelijk recent actief was.

alter table public.barber_profiles add column last_active_at timestamptz;

grant update (last_active_at) on public.barber_profiles to authenticated;

comment on column public.barber_profiles.last_active_at is
  'Wordt elke ~20s bijgewerkt door een heartbeat in barber/layout.tsx zolang een barber-scherm open is met een geldige sessie — puur "was de app onlangs actief", losstaand van de handmatige is_online-schakelaar. barber_is_online_and_available() eist beide.';

-- Volledige body herhaald per regel 22 CLAUDE.md — alleen de
-- last_active_at-voorwaarde is nieuw.
create or replace function public.barber_is_online_and_available(p_barber_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select bp.is_online
        and bp.last_active_at is not null
        and bp.last_active_at > now() - interval '90 seconds'
        and (bp.availability ->> (case extract(isodow from now())::int
          when 1 then 'Ma' when 2 then 'Di' when 3 then 'Wo' when 4 then 'Do'
          when 5 then 'Vr' when 6 then 'Za' when 7 then 'Zo' end
        ))::boolean
        and not exists (
          select 1 from public.bookings b
          where b.barber_id = p_barber_id
            and b.status in ('accepted', 'en_route', 'arrived', 'in_progress')
        )
      from public.barber_profiles bp
      where bp.id = p_barber_id
    ),
    false
  );
$$;

comment on function public.barber_is_online_and_available(uuid) is
  'Online + recent actief (last_active_at < 90s oud, zie 0037) + vandaag beschikbaar volgens weekschema + geen actieve boeking. Gebruikt door find_nearest_eligible_barber (matching) en de "Barbers can view/claim paid open requests"-RLS-policies op bookings (0007/0021) — dus dit dekt zowel het auto-toewijzen als het zichtbaar worden van broadcast-aanvragen voor de barber zelf, én de offline-waarschuwing op klant/boeking.';
