-- Op verzoek van de gebruiker: een barber die "online" aanzet moet
-- online BLIJVEN totdat hij het zelf weer uitzet (of uitlogt, dat zette
-- al eerder is_online=false, zie barber/profiel.tsx/profiel/page.tsx) —
-- niet stilzwijgend "offline" worden zodra de 90-seconden-heartbeat
-- (last_active_at, migratie 0037) verloopt, bijvoorbeeld omdat de app
-- op de achtergrond staat of het scherm vergrendeld is. Dat
-- heartbeat-gedrag was deze hele sessie ook al herhaaldelijk een bron
-- van verwarring tijdens het testen (leek willekeurig "offline" te
-- gaan).
--
-- last_active_at zelf blijft bestaan (nog steeds nuttig als
-- diagnostisch "laatst actief"-gegeven) — alleen niet langer een
-- voorwaarde om als beschikbaar te gelden. is_online (expliciete
-- toggle/uitloggen) en het weekschema/geen-actieve-rit blijven
-- onverkort de echte gates.
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
        and (bp.availability ->> (case extract(isodow from now())::int
          when 1 then 'Ma' when 2 then 'Di' when 3 then 'Wo' when 4 then 'Do'
          when 5 then 'Vr' when 6 then 'Za' when 7 then 'Zo' end
        ))::boolean
        and not exists (
          select 1 from public.bookings b
          where b.barber_id = p_barber_id
            and b.status in ('price_pending', 'accepted', 'en_route', 'arrived', 'in_progress')
        )
      from public.barber_profiles bp
      where bp.id = p_barber_id
    ),
    false
  );
$$;

comment on function public.barber_is_online_and_available(uuid) is
  'Online (expliciete toggle, blijft aan tot de barber ''m zelf uitzet of uitlogt) + vandaag beschikbaar volgens weekschema + geen actieve/pending boeking. Gebruikt door find_nearest_eligible_barber + de broadcast-RLS-policies op bookings. Sinds 0050 geen last_active_at-heartbeat-eis meer (stond los van is_online stilzwijgend "offline" te laten lijken zodra de app op de achtergrond stond).';
