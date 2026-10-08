-- Eerste-keer-rondleiding voor klant en barber (los van onboarding_completed,
-- dat is barber-verificatie-onboarding — dit is puur "heeft deze gebruiker
-- de UI-rondleiding al gezien", voor beide rollen).
alter table public.profiles add column tutorial_seen_at timestamptz;

comment on column public.profiles.tutorial_seen_at is
  'Null = nog niet getoond, dan verschijnt de rondleiding automatisch op klant-home/barber-dashboard. Zelf op null te zetten vanaf "Rondleiding opnieuw bekijken" in het profielscherm.';

grant update (tutorial_seen_at) on public.profiles to authenticated;

-- Zonder backfill zou elke BESTAANDE gebruiker (incl. test-/familie-
-- accounts) de rondleiding bij de volgende load alsnog te zien krijgen —
-- dit is alleen bedoeld voor nieuwe registraties na deze migratie.
update public.profiles set tutorial_seen_at = now() where tutorial_seen_at is null;
