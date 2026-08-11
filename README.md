# Groomy

"Uber voor barbers" — een marketplace voor mobiele zzp-barbers. Klanten
boeken een barber op locatie; de betaling gaat via Stripe in escrow en
wordt na afronding vrijgegeven aan de barber, tenzij binnen 24 uur een
geschil wordt geopend.

Dit document is de technische onboarding: hoe je het project lokaal
draaiend krijgt, hoe alles is opgezet, en hoe je naar productie
deployt. Voor de volledige bouwgeschiedenis, architectuurkeuzes per fase
en bekende openstaande punten, zie [`PROJECT.md`](PROJECT.md) en
[`CLAUDE.md`](CLAUDE.md).

## Inhoud

- [Tech stack](#tech-stack)
- [Benodigde software](#benodigde-software)
- [Lokaal opzetten](#lokaal-opzetten)
- [Supabase instellen](#supabase-instellen)
- [Stripe instellen](#stripe-instellen)
- [Environment variables](#environment-variables)
- [Deployen naar Vercel](#deployen-naar-vercel)
- [Architectuur](#architectuur)
- [Nuttige commando's](#nuttige-commandos)

## Tech stack

| Laag | Keuze |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 3, custom design tokens (`tailwind.config.ts`) |
| Database/Auth/Storage | Supabase (Postgres, Row Level Security, Storage, Auth) |
| Betalingen | Stripe (Payment Intents, Connect Express, escrow via Transfers) |
| E-mail | Resend |
| Push-notificaties | Web Push (VAPID), eigen service worker (`public/sw.js`) |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) |
| Error monitoring | Sentry (`@sentry/nextjs`) |
| Hosting | Vercel |

Geen ORM — alle database-toegang gaat via de Supabase JS-client
(`@supabase/supabase-js`/`@supabase/ssr`), met RLS-policies als
autorisatielaag in plaats van applicatiecode.

## Benodigde software

- **Node.js 20+** en npm (gebruik wat `package.json`/`package-lock.json`
  verwacht — geen exotische versie nodig, elke recente LTS werkt).
- **Supabase CLI** (`npm install -g supabase`, of laat `npx supabase`
  het per-project installeren — hoeft niet globaal).
- **Stripe CLI** (optioneel, alleen nodig om webhooks lokaal te testen
  met `stripe listen`) — [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli).
- Een **Supabase-account** (gratis tier is voldoende om te starten) en
  een **Stripe-account** (test mode, gratis).
- Voor productie: een **Vercel-account**, en optioneel **Sentry**- en
  **Upstash**-accounts (zie [Environment variables](#environment-variables)
  — de app draait ook prima lokaal zonder deze twee).

## Lokaal opzetten

```bash
git clone <repo-url> groomy
cd groomy
npm install
cp .env.local.example .env.local
# vul .env.local in — zie "Supabase instellen" en "Stripe instellen" hieronder
npm run dev
```

De app draait dan op `http://localhost:3000`. Er is geen seed-data — je
hebt minimaal één klant-account en één (goedgekeurd) barber-account
nodig om de boekingsflow te doorlopen. Zie "Eerste gebruikers aanmaken"
hieronder.

## Supabase instellen

### 1. Nieuw project + CLI koppelen

```bash
npx supabase login
npx supabase link --project-ref <jouw-project-ref>
```

Het project-ref vind je in de Supabase-dashboard-URL
(`supabase.com/dashboard/project/<ref>`) of onder Project Settings →
General.

### 2. Migraties pushen

Alle schema, RLS-policies, triggers en functies staan als losse,
oplopend genummerde bestanden in `supabase/migrations/`. Nooit
handmatig in de SQL Editor knoeien buiten migraties om — dat raakt
onherleidbaar uit sync met wat hier in git staat.

```bash
npx supabase db push
```

Dit voert alle 16 migraties in volgorde uit (genummerd `0001`–`0017`,
`0008` is destijds bewust nooit gebruikt/aangemaakt). Ze zijn
idempotent-veilig te herdraaien vanaf een leeg project, maar **niet** ontworpen om
individueel over te slaan — voer ze altijd in volgorde uit.

### 3. Extensies aanzetten (voor de escrow-cron)

De automatische vrijgave van escrow-betalingen (24 uur na afronding,
zie `0011_escrow_release_cron.sql`) draait via Postgres' eigen
`pg_cron`/`pg_net`-extensies, **niet** via een externe cron-service.
Zet ze aan in het dashboard onder **Database → Extensions** vóórdat je
migratie `0011` pusht (kan niet vanuit een migratie zelf).

Na de eerste deploy moet je ook `app_config` bijwerken met je echte
deploy-URL en `CRON_SECRET` (staat in de migratie als placeholder):

```sql
update public.app_config set value = 'https://jouw-deploy-url.vercel.app' where key = 'api_base_url';
update public.app_config set value = 'jouw-cron-secret' where key = 'cron_secret';
```

Zolang `api_base_url` nog de placeholder-waarde is, slaat de cron
zichzelf bewust over (met een `notice` in de Postgres-logs) in plaats
van te falen tegen een niet-bestaande URL — lokaal ontwikkelen wordt
hier dus niet door geblokkeerd.

### 4. Storage-buckets

Worden automatisch aangemaakt door migratie `0004_barber_verification.sql`
(`barber-media`, publiek — portfoliofoto's; `barber-documents`, privé —
KvK/verzekering/diploma). Geen handmatige stap nodig.

### 5. Auth-instellingen (dashboard)

Onder **Authentication → URL Configuration**:
- **Site URL**: je lokale of productie-URL (bv. `http://localhost:3000`
  lokaal, je Vercel-URL in productie).
- **Redirect URLs**: voeg `<jouw-url>/auth/confirm` toe — dit is de
  route die e-mailbevestigingslinks afhandelt (`src/app/auth/confirm/route.ts`).

Supabase's gratis mailquota is laag en rate-limit't snel tijdens
ontwikkelen/testen. Voor testaccounts die niet via een echte inbox
hoeven te gaan, gebruik de **Admin API** in plaats van `signUp()`:

```bash
curl -X POST '<NEXT_PUBLIC_SUPABASE_URL>/auth/v1/admin/users' \
  -H "apikey: <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "klant@test.nl",
    "password": "Test123!",
    "email_confirm": true,
    "user_metadata": { "role": "customer", "full_name": "Test Klant", "phone": "0612345678" }
  }'
```

Voor een barber-account: `"role": "barber"` — die belandt na inloggen
automatisch in de aanmeld-flow (`/barber/aanmelden`), en moet daarna via
het adminpanel op `approved` gezet worden voordat die zichtbaar is voor
klanten (zie hieronder).

### 6. Eerste adminaccount aanmaken

Er is bewust geen registratieformulier voor admins (zie "Architectuur").
Maak het eerste account op dezelfde manier als hierboven, met
`"role": "admin"` in `user_metadata` — de `handle_new_user()`-trigger
zet die dan automatisch in `admin_users` in plaats van `profiles`. Log
daarna in op `/admin/login`.

## Stripe instellen

### 1. API-sleutels

Dashboard → Developers → API keys (test mode). `STRIPE_SECRET_KEY` en
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local`.

### 2. Webhook (lokaal)

De app luistert op `POST /api/stripe/webhook` voor
`payment_intent.succeeded` en `account.updated` — dit is de **enige**
plek waar een `payments`-rij mag ontstaan (nooit op basis van een
client-side "succes"-signaal). Lokaal forward je events met de Stripe
CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Dit print een `whsec_...`-signing secret — zet die in
`STRIPE_WEBHOOK_SECRET`.

### 3. Webhook (productie)

Na de eerste Vercel-deploy: Dashboard → Developers → Webhooks → nieuw
endpoint tegen `https://<jouw-domein>/api/stripe/webhook`, events
`payment_intent.succeeded` en `account.updated`. Het bijbehorende
signing secret is **anders** dan je lokale — apart invullen in Vercel's
env vars, niet hergebruiken.

### 4. Connect (voor barber-uitbetalingen)

Geen aparte configuratie nodig — barbers doorlopen Stripe's gehoste
Express-onboarding vanuit `/barber/uitbetalingen`
(`src/app/api/stripe/connect-onboarding/route.ts` maakt het account
aan). Voor test mode kun je Stripe's testgegevens gebruiken om de
onboarding-flow af te ronden.

### 5. Live mode (bij daadwerkelijke livegang)

Test-mode-sleutels → live-mode-sleutels, plus een nieuw
webhook-endpoint tegen je productie-URL (levert een nieuw secret op).
Zie de checklist in `PROJECT.md` → "Pre-launch audit — architectuur"
voor de volledige livegang-stappen.

## Environment variables

Volledige, actuele lijst staat in [`.env.local.example`](.env.local.example)
met toelichting per var. Samengevat:

| Var | Verplicht lokaal? | Bron |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ja | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ja | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Ja | Supabase → Project Settings → API (geheim, nooit client-side) |
| `STRIPE_SECRET_KEY` | Ja | Stripe → Developers → API keys |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Ja | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Ja | `stripe listen` (lokaal) of het webhook-endpoint (productie) |
| `CRON_SECRET` | Ja | Zelf verzinnen — moet gelijk zijn aan `app_config.cron_secret` |
| `RESEND_API_KEY` | Ja | Resend → API Keys |
| `RESEND_FROM_EMAIL` | Ja | Een adres in je Resend-account (sandbox: alleen je eigen accountadres) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Ja | `npx web-push generate-vapid-keys` (eenmalig) |
| `VAPID_SUBJECT` | Ja | `mailto:jouw-email@voorbeeld.nl` |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Nee | Upstash-dashboard — zonder deze vars is er lokaal simpelweg geen rate limit |
| `NEXT_PUBLIC_SENTRY_DSN` | Nee | Sentry-project → Client Keys — zonder deze var init't Sentry niet (geen foutmelding) |
| `NEXT_PUBLIC_SITE_URL` | Nee | Absolute basis-URL (OG-tags/sitemap) — valt lokaal terug op `localhost:3000` |

## Deployen naar Vercel

1. Push de repo naar GitHub, importeer 'm in Vercel (of gebruik de
   Vercel CLI).
2. Zet alle env vars uit de tabel hierboven in Vercel's project-
   instellingen (begin met test-mode Stripe-sleutels, zodat je de
   deploy zelf kan proberen zonder meteen live te gaan).
3. Deploy. Werk daarna `app_config.api_base_url` in Supabase bij naar
   de echte deploy-URL (zie stap 3 onder "Supabase instellen") — pas
   dan gaat de escrow-release-cron echt draaien.
4. Maak een Stripe-webhook-endpoint tegen de productie-URL (zie
   "Stripe instellen" hierboven) en zet het nieuwe secret in Vercel.
5. Optioneel: Sentry-project en Upstash-database aanmaken, credentials
   toevoegen.
6. Zodra je een eigen domein hebt: DNS instellen, domein toevoegen in
   Vercel, `NEXT_PUBLIC_SITE_URL` bijwerken.

Er is bewust **geen** `vercel.json` met een cron-config — de
escrow-release draait al via Supabase's `pg_cron`, een Vercel Cron zou
dat alleen maar dupliceren.

Voor de volledige livegang-checklist (Resend-domein verifiëren, Stripe
naar live mode, testdata opschonen, smoke test) zie `PROJECT.md` →
"Pre-launch audit — architectuur" → "Checklist voor live gaan".

## Architectuur

### Mappenstructuur

```
src/
  app/
    klant/          klant-app (mobiel, in PhoneShell-frame)
    barber/         barber-app (mobiel, in PhoneShell-frame)
    admin/          adminpanel (desktop, geen PhoneShell)
    api/            Route Handlers — Stripe, wallet, admin-mutaties, cron, geocode
    auth/           e-mailbevestiging/foutafhandeling voor Supabase Auth
    {error,not-found,global-error}.tsx   app-brede foutschermen
  components/
    ui/             designsysteem-primitieven (Button, Input, Dialog, ...)
    shared/         samengestelde componenten (PhoneShell, Row, EscrowDot, ...)
    admin/          adminpanel-specifieke tabellen/formulieren
    wallet/         wallet-topup-flow (klant + barber gedeeld)
  lib/
    supabase/       client-/server-/service-role-clients, alle DB-queries (queries.ts), admin-auth
    stripe.ts / stripe-client.ts   server- resp. client-side Stripe SDK
    pricing.ts      enige bron van waarheid voor prijsberekening (15% platform fee)
    wallet.ts       wallet/loyaliteit-constantes
    rate-limit.ts   Upstash-gebaseerde rate limiter
    resend.ts / push.ts   e-mail resp. web-push-verzending
  middleware.ts     alle route-/rolbeveiliging (zie hieronder)
supabase/
  migrations/       genummerde SQL-migraties — schema, RLS, triggers, functies
```

### Rolmodel

Drie totaal gescheiden identiteiten, geen gedeelde tabel:

- **Klant/barber**: één `profiles`-rij per gebruiker, met
  `role: 'customer' | 'barber'` uit `auth.users.user_metadata.role` (JWT-
  claim, gezet bij registratie). `barber_profiles`/`customer_profiles`
  zijn 1:1-extensietabellen.
- **Admin**: een losstaande `admin_users`-tabel, **geen** `profiles`-rij.
  Geen registratieformulier — het eerste account wordt via de Supabase
  Admin API aangemaakt (zie hierboven). Middleware herkent een
  adminsessie aan `user_metadata.role === 'admin'`, exact hetzelfde
  mechanisme als klant/barber.

`middleware.ts` is de **enige** plek die rol-/sessiebeveiliging voor
`/klant/*`, `/barber/*` en `/admin/*` afdwingt — geen dubbele guards in
individuele pagina's. Een klant/barber die op `/admin` uitkomt wordt
stil naar de eigen home gestuurd (geen foutmelding die verraadt dat er
een adminpanel bestaat).

### Data-toegang: RLS, niet applicatiecode

Zo goed als elke tabel heeft **row level security** aan, met policies
die scopen op `auth.uid()`. Tabellen met alleen server-side schrijfpaden
(`payments`, `admin_users`, `admin_action_log`, `discount_codes`, ...)
hebben `revoke all from anon, authenticated` — die zijn alleen
bereikbaar via `createServiceClient()` (de service-role-client, altijd
server-side, nooit in een `"use client"`-bestand). Zie
`src/lib/supabase/{client,server,service}.ts` voor de drie
clientvarianten en wanneer welke te gebruiken.

**Belangrijke valkuil** (zie ook `CLAUDE.md` regel 7): een RLS-policy
alleen is niet genoeg — kolom-niveau grants moeten er vaak bovenop.
Voorbeeld: `bookings` had tot de pre-launch audit een ongescoopte
INSERT-grant, waardoor een klant élk veld in een nieuwe boeking kon
zetten (inclusief `status: 'completed'` zonder ooit te betalen). Zie
`0017_prelaunch_audit_fixes.sql` voor de fix (een `before insert`-
trigger die prijs/status server-side afdwingt, plus een kolom-scoped
grant).

### Escrow-flow (Stripe)

1. Klant betaalt via een Payment Intent
   (`/api/stripe/create-payment-intent`) — bedrag komt uit
   `computePriceBreakdown()` (`src/lib/pricing.ts`), nooit uit
   client-input.
2. Bij `payment_intent.succeeded` (webhook, geverifieerd met
   `STRIPE_WEBHOOK_SECRET`) ontstaat de `payments`-rij met
   `escrow_state: 'held'`.
3. Ná afronding (`bookings.status → 'completed'`) draait elke 15
   minuten `0011`'s `pg_cron`-job, die `/api/cron/release-escrow`
   aanroept. Die geeft een betaling pas vrij (`transfers.create` naar
   de barber's Stripe Connect-account) als: 24 uur verstreken sinds
   afronding, geen open geschil, en de barber's Connect-account
   `stripe_payouts_enabled` is (server-side geverifieerd via de
   `account.updated`-webhook, nooit client-schrijfbaar sinds `0017`).
4. Een geschil binnen 24 uur (`/klant/geschil`) blokkeert de
   vrijgave; een admin lost het op via `/admin/geschillen`
   (terugbetalen of alsnog vrijgeven).

### Matching (Fase 5)

`find_nearest_eligible_barber()` (SQL-functie, `0007_matching.sql`)
zoekt de dichtstbijzijnde online, `approved`-barber binnen diens eigen
werkstraal die de gevraagde dienst aanbiedt. Een broadcast-aanvraag
(`bookings.barber_id = null`) is voor elke eligible barber zichtbaar;
`claimBooking()` claimt 'm atomisch
(`update ... where barber_id is null and status = 'requested'`) — bij
een race wint er maar één barber, de rest krijgt een nette
"al vergeven"-melding.

### Adminpanel

Desktop-georiënteerd (geen `PhoneShell`), onder `/admin/*`. Elke
schrijvende actie gaat via een `/api/admin/*`-route die eerst
`requireAdmin()` checkt (`src/lib/supabase/admin.ts`) en daarna
`logAdminAction()` aanroept — een compleet, chronologisch logboek van
elke adminactie staat op `/admin/logboek`.

### Statuspagina's

`error.tsx`/`global-error.tsx`/`not-found.tsx` vangen respectievelijk
runtime-fouten binnen de layout, fouten in de layout zelf, en 404's —
alle drie sturen naar Sentry als `NEXT_PUBLIC_SENTRY_DSN` gezet is.

## Nuttige commando's

```bash
npm run dev            # lokale dev-server (localhost:3000)
npm run build           # productie-build + type-check + lint
npm run lint             # alleen lint
npx supabase db push      # migraties naar het gelinkte Supabase-project pushen
npx supabase migration new <naam>   # nieuwe, oplopend genummerde migratie aanmaken
stripe listen --forward-to localhost:3000/api/stripe/webhook   # lokaal webhooks testen
```

Draai `npm run build` altijd vóór je iets als "af" beschouwt — dat is
zowel de type-check als de lint-check in één.
