-- Op verzoek van de gebruiker: echte pushmeldingen naar de native app.
-- `push_subscriptions` (0013) is Web Push voor de browser (endpoint/
-- p256dh/auth) — structureel iets anders dan een Expo-push-token
-- (simpele string), dus een eigen kolom i.p.v. die tabel hergebruiken.
-- Eén token per profiel (laatste login wint) is bewust simpel gehouden
-- voor een eerste versie — geen multi-device-tabel, net als
-- email_notifications_enabled hiervoor ook gewoon een kolom op
-- profiles is.
alter table public.profiles add column expo_push_token text;

grant update (expo_push_token) on public.profiles to authenticated;

comment on column public.profiles.expo_push_token is
  'Expo push-token van het laatst ingelogde apparaat (native app) — door de klant/barber zelf gezet bij het inloggen, zie AuthProvider in KPPRTJE-app. Gebruikt door /api/notifications/send om naast e-mail/webpush ook een echte mobiele pushmelding te sturen via Expo''s push-API.';
