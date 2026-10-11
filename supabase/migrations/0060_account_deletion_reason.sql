-- Gevraagd door de gebruiker: bij account verwijderen (0055) moet een
-- reden worden opgegeven, en die reden moet admin-kant terug te lezen
-- zijn (statistiek + lijst). Losse tabel i.p.v. een kolom op `profiles`
-- — die rij wordt bij verwijdering juist geanonimiseerd/mag niet een
-- vrije-tekst-reden blijven dragen, en een losse tabel leent zich beter
-- voor een admin-lijst (sorteren/tellen) dan een los veld tussen de
-- geanonimiseerde profielvelden.
--
-- Geen RLS-policies nodig (zelfde patroon als de rest van de admin-
-- tabellen, bv. disputes, 0003): RLS staat aan (sluit anon/authenticated
-- dus standaard buiten), de enige twee plekken die deze tabel raken
-- (de delete-route, en het admin-dashboard) draaien allebei al via de
-- service role, die RLS toch bypassed.
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  role public.user_role not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.account_deletions enable row level security;

comment on table public.account_deletions is
  'Eén rij per account-verwijdering (0055/API-route /api/account/delete) — bewaart de door de gebruiker verplicht opgegeven reden, los van het geanonimiseerde profiles-record. Alleen via de service role gelezen/geschreven (admin-dashboard, delete-route) — geen RLS-policies nodig.';

create index account_deletions_created_at_idx on public.account_deletions (created_at desc);
