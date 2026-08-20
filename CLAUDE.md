# CLAUDE.md

Context voor Claude (of een andere engineer) die verderwerkt aan dit project.
Houd dit bestand actueel: werk het bij zodra een fase start/eindigt of een
belangrijke architectuurkeuze wordt gemaakt.

## Wat dit project is

Groomy MVP — Next.js 15 + TypeScript + Tailwind + Supabase Auth, herbouwd
vanuit een design-handoffpakket (`design_handoff_groomy_mvp/`, niet meer
nodig zodra de UI stabiel is, maar nog aanwezig als referentie). Zie
`PROJECT.md` voor de volledige status, mappenstructuur en architectuur.

## Regels voor dit project

1. **Design-fidelity is leidend.** Kleuren, spacing, radii en copy in de
   design tokens (`tailwind.config.ts`) en de originele schermen zijn
   definitief. Wijk er niet vanaf zonder het expliciet met de gebruiker af te
   stemmen.
2. **Nederlandse copy, "je/jij", nooit "u".** Sentence case overal. Geen
   emoji, geen overdreven uitroeptekens.
3. **Mock data (`src/lib/mock-data.ts`) is nog alleen voor
   verdiensten/reviews/notificaties** — boekingen zijn sinds Fase 4 echt
   (Supabase). Betalingen blijven mock/decoratief tot Fase 6.
4. **Componenten uit `components/ui/` zijn de enige plek voor
   designsysteem-primitives.** Nieuwe schermen hergebruiken deze in plaats
   van eigen knoppen/inputs te stijlen.
5. **`npm install`/`npm run dev`/`npm run build` kunnen door Claude
   uitgevoerd worden** — de sandbox heeft inmiddels netwerktoegang. Draai
   `npm run build` (type-check + lint) na elke fase vóór je die als
   afgerond markeert.
6. **Route-protectie hoort in `src/middleware.ts`, niet per pagina.**
   Middleware is de enige plek die rol/sessie checkt voor `/klant/*` en
   `/barber/*` — voeg geen dubbele guards toe in layouts of pagina's, dat
   geeft alleen inconsistentie.
7. **RLS-policies op Supabase-tabellen zijn niet genoeg op zichzelf.** Denk
   bij elke nieuwe tabel na over kolom-niveau grants (zie
   `supabase/migrations/0001_init_profiles.sql` voor het patroon) — een
   row-policy laat een gebruiker nog steeds élke kolom van zijn eigen rij
   aanpassen tenzij je dat expliciet inperkt.
8. **Stop bij het einde van elke fase** en wacht op akkoord van de gebruiker
   voordat je aan de volgende fase begint (zie roadmap in `PROJECT.md`).
9. **`barber_status` heeft vier waarden** (`pending`/`approved`/`rejected`/
   `suspended`, zie "Barber-verificatiestatus" in `PROJECT.md` voor de
   volledige betekenis). Er is bewust nog geen adminpanel/goedkeuringsflow
   gebouwd — bouw die niet stilzwijgend erbij zonder het eerst met de
   gebruiker af te stemmen, ook al zou het "logisch" aanvoelen om er een
   klant-zichtbaarheidsfilter of statusscherm bij te pakken.
10. **Een RLS-policy die tegen een andere RLS-beveiligde tabel subquery't,
    komt leeg terug voor rijen van iemand anders** — die subquery is zelf
    óók onderhevig aan de policies van de tabel waartegen hij subquery't.
    Gebruik hiervoor een kleine `security definer`-functie die alleen een
    boolean (of het strikt noodzakelijke veld) teruggeeft, nooit de hele
    rij. Zie `public.is_approved_barber()` in
    `supabase/migrations/0003_booking_system_schema.sql` als referentie-
    patroon.
11. **Migraties gaan via `npx supabase db push`**, niet meer primair via
    copy-paste in de SQL Editor (dat blijft een werkende fallback). Project
    is gelinkt aan Supabase-project-ref `xzlppuvfgfjxeqdmrmsu`. Claude kan
    de CLI zelf installeren/init'en, maar `login`/`link`/`db push` moet de
    gebruiker zelf draaien (accountauthenticatie/DB-wachtwoord — niet iets
    om namens de gebruiker in te voeren). Nieuwe migratie = nieuw
    `NNNN_naam.sql`-bestand met oplopend nummer.
12. **Postgres' default-privileges op het `public`-schema gelden ook voor
    views en functies, niet alleen tabellen.** Een nieuwe view/functie die
    gevoelige data blootlegt heeft dus **altijd** een expliciete
    `revoke all ... from anon` nodig (zie `0006_lock_down_approved_barbers_view.sql`)
    — ga er niet vanuit dat `grant select ... to authenticated` alleen
    betekent dat anon niets kan.
13. **Bij het testen van twee rollen tegelijk in de browser-preview** (bv.
    klant + barber): tabbladen delen dezelfde cookies/sessie. Twee sessies
    tegelijk vereist uitloggen/inloggen tussen stappen, niet zomaar een
    tweede tabblad met een andere login — anders bounced de middleware je
    naar de rol die toevallig actief is.
14. **Testaccounts aanmaken wanneer `signUp()` rate-limited is**: gebruik
    de Supabase **Admin API** (`POST {url}/auth/v1/admin/users`) met
    `user_metadata: {role, full_name, phone}` en `email_confirm: true` —
    dit omzeilt de gratis mailquota volledig én is de enige manier om een
    werkend account te krijgen in dit schema (de Studio-"Add user"-knop
    geeft geen `user_metadata` mee, waardoor `handle_new_user()` faalt op
    de `not null`-constraint van `profiles.role`, zie regel 9/2). De
    gebruiker draait dit command zelf in hun eigen terminal met hun eigen
    service role key (nooit door Claude uit te voeren of te zien, zie
    regel 7) — geef als single-line `curl`-commando (multi-line met `\`
    breekt vaak bij copy-paste in de terminal).
15. **De service role key (`src/lib/supabase/service.ts`) is alleen voor
    tabellen zonder client-grant** (`payments`-writes, `disputes.status`,
    de escrow-releasejob) — **niet** om bestaande, al-gevalideerde
    client-acties zoals een boekingsstatus-update mee te vervangen. Zie
    `/api/stripe/cancel-and-refund` (Fase 6) als referentiepatroon: de
    statusovergang zelf loopt nog via de normale gebruikerssessie (zodat
    `check_booking_status_transition()` gewoon blijft valideren — die
    functie slaat alle validatie over zodra `auth.uid()` null is, wat bij
    een service-role-call altijd het geval is), en alleen de refund-stap
    erna (die wél een tabel zonder client-grant raakt) gebruikt de service
    role. Een RLS-policy die twee tabellen over en weer bevraagt (bv.
    `bookings` die `payments` checkt, en `payments` die op zijn beurt
    `bookings` checkt) geeft oneindige recursie (42P17) — zelfde
    onderliggende patroon als regel 10, nu tussen twee tabellen i.p.v. één
    tabel die zichzelf bevraagt; fix is dezelfde
    `security definer`-boolean-functie-truc (zie `booking_has_payment()`
    in `0010_fix_bookings_payments_rls_recursion.sql`).
16. **React 19's Strict Mode voert `useEffect` dubbel uit in dev** — voor
    een gewone read onschadelijk, maar een effect dat een niet-idempotente
    server-actie aanroept (bv. een nieuwe Stripe PaymentIntent aanmaken)
    heeft een `useRef`-guard nodig om dubbele side-effects te voorkomen.
    Zie `/klant/betaling` (Fase 6) — zonder guard ontstonden twee
    PaymentIntents en twee botsende Payment Element-instanties.
17. **Stripe-hosted formulieren (Payment Element, Connect-onboarding)
    draaien in cross-origin iframes** die niet bereikbaar zijn via
    `read_page`/`find`/JS-injectie vanuit de parent-pagina (browser-
    sandboxing) — alleen coördinaat-gebaseerde `computer`-clicks werken,
    en zelfs die zijn onbetrouwbaar op Stripe's KYC-onboardingformulier
    (vermoedelijk bewuste bot-weerstand: geen netwerkverzoek vuurt zelfs af
    bij een gesimuleerde klik). Voor het testen van een echte betaling: een
    PaymentIntent kan ook server-side bevestigd worden zonder de UI, met
    Stripe's gedocumenteerde testbetaalmethode `pm_card_visa` (zie
    `stripe.paymentIntents.confirm(id, {payment_method: 'pm_card_visa',
    return_url: ...})` via de API) — test zo de rest van de flow
    (webhook, RLS-gating, escrow) zonder van de interactieve
    kaartinvoer af te hangen.
18. **Nieuwe `/api/*`-routes die gevoelig zijn voor misbruik krijgen een
    `checkRateLimit()`-check** (`src/lib/rate-limit.ts`, Fase 11) als
    eerste regel in de handler — zelfde vroege-return-stijl als
    `requireAdmin()`. Zonder `UPSTASH_REDIS_REST_URL`/`_TOKEN` (lokaal
    ontwikkelen) is er bewust geen limiet, dus dit blokkeert lokaal werken
    nooit. Niet nodig voor routes die al puur intern/machine-to-machine
    zijn (bv. `/api/cron/*`, met een eigen `CRON_SECRET`-check) — daar
    voegt een IP-limiet niets toe.
19. **De Content-Security-Policy in `next.config.ts` geldt alleen bij
    `NODE_ENV=production`** (Fase 11) — voeg geen nieuwe externe host toe
    aan `script-src`/`connect-src`/etc. zonder de CSP-array bij te werken,
    anders breekt die host stilzwijgend in productie terwijl `next dev`
    niets laat zien (CSP staat daar uit voor HMR).
20. **Een INSERT-grant zonder kolom-scoping is net zo gevaarlijk als een
    losse UPDATE-grant** (pre-launch audit, `bookings`) — het is niet
    genoeg om alleen te checken "wie" mag inserten (`with check
    (auth.uid() = customer_id)`); zonder een `before insert`-trigger die
    server-side-bepaalde velden (status, snapshot-prijzen, etc.)
    afdwingt, kan de client ze gewoon meesturen in de insert-payload.
    Nieuwe tabellen met een client-insert-grant: denk na of er velden
    zijn die de client nooit zelf mag bepalen, en dwing die af via een
    `before insert`-trigger, niet alleen via de policy.
21. **Admin-mutatieroutes loggen pas naar `admin_action_log` ná een
    bevestigde treffer** (pre-launch audit) — `.update()`/`.delete()`
    geven geen `error` bij 0 matchende rijen, dus check altijd
    `.select()`'s teruggegeven rijen (`data.length > 0`) vóór
    `logAdminAction()`, anders kan het logboek een actie claimen die
    feitelijk niets deed.
22. **`create or replace function` vervangt de hele functiebody — geen
    incrementele patch.** Bij het uitbreiden van een bestaande trigger-
    functie (bv. `handle_new_user()` voor een nieuwe rol) moet je de
    **volledige** oude body meenemen, niet alleen het nieuwe stuk
    toevoegen. `0016_admin_fase10.sql` deed dit fout: de admin-rol-tak
    werd toegevoegd, maar de al bestaande `insert into barber_profiles`/
    `insert into customer_profiles` (sinds `0003`) werd stilzwijgend niet
    overgenomen — pas maanden later zichtbaar toen een barber een
    FK-fout kreeg. Diff een nieuwe `create or replace function`-body
    altijd expliciet tegen de vorige versie in git/migratiegeschiedenis
    vóór je 'm pusht.
23. **Kolom-grants (`grant select (kolom, ...) on tabel to rol`) gelden per
    rol, niet per policy.** Als twee RLS-policies op dezelfde tabel matchen
    voor verschillende doelgroepen (bv. "eigen rij, alles zichtbaar" en
    "andermans rij, alleen veilige kolommen zichtbaar"), dan bepaalt de
    kolom-grant voor die rol nog steeds welke kolommen **iedereen** met die
    rol mag lezen — ongeacht welke policy de rij toestond. Een kale `grant
    select on tabel to authenticated` (zonder kolomlijst) geeft dus alle
    kolommen van élke rij die de gecombineerde policies doorlaten, ook als
    de bedoeling was "vreemden zien alleen X, jijzelf ziet alles" (gevonden
    op `barber_profiles`, zie `0020_lock_down_barber_profiles_columns.sql`
    — `iban`/`kvk_number`/`insurance_doc_url`/`id_doc_url` waren zo voor elke
    ingelogde klant leesbaar via een rechtstreekse `barber_profiles`-call,
    ook al gebruikte de app zelf alleen de veilige `approved_barbers`-view).
    Fix voor "eigen volledige rij lezen" wanneer de brede grant is
    ingeperkt tot veilige kolommen: een `security definer`-functie die
    intern op `auth.uid()` filtert en de volledige rij teruggeeft (zie
    `get_own_barber_profile()`) — dezelfde functie-truc als regel 10, hier
    niet voor RLS-recursie maar voor een kolom-grant die anders ook de
    eigen rij zou afknippen.

## Statuslog

- **Fase 0: afgerond.** Next.js-project opgezet, design tokens overgezet
  naar Tailwind, 16 UI-componenten + 7 shared componenten gebouwd, alle
  schermen uit beide ui_kits herbouwd met mock data. Lokaal getest door de
  gebruiker (`npm install && npm run dev` werkt). Tijdens deze fase is ook
  een kritieke Next.js-kwetsbaarheid (CVE-2025-66478) gepatcht: `next`
  15.1.6 → 15.5.20, `eslint` → 9.39.5 (+ migratie naar flat config,
  `eslint.config.mjs`), root-`postcss` → 8.5.10.
- **Fase 1: afgerond.** Supabase Auth toegevoegd:
  - `profiles`-tabel (rol customer/barber, RLS + kolom-niveau grants, zie
    `supabase/migrations/0001_init_profiles.sql`) met trigger die de rij
    aanmaakt bij registratie.
  - Registratie/login voor klant én barber (`/klant/login|register`,
    `/barber/login|register` — barber had nog geen eigen auth-schermen,
    die zijn nieuw toegevoegd), e-mailbevestiging verplicht.
  - `src/middleware.ts`: rol-gebaseerde route-protectie voor alle
    `/klant/*` en `/barber/*` routes, geen per-pagina guards.
  - `src/app/auth/confirm/route.ts`: verwerkt bevestigings-/reset-links
    server-side (`verifyOtp`), `src/app/auth/error/page.tsx` voor
    verlopen/ongeldige links.
  - Wachtwoord vergeten/instellen voor beide rollen.
  - Logout: klant via bestaande `instellingen`-pagina (nu echt gewired),
    barber via nieuwe knop op `profiel` (barber had nog geen
    instellingenscherm — geen nieuw scherm toegevoegd, logout staat direct
    op de bestaande profielpagina).
  - `barber/aanmelden` zet nu `profiles.onboarding_completed = true` bij
    versturen; de KvK/verificatie/diensten-velden zelf zijn nog steeds
    lokale UI-state (geen backend-opslag — bewuste scope-afbakening, zie
    `PROJECT.md`).
  - `npm run build` en `npm run lint` draaien beide schoon (0 errors,
    0 warnings).
  - **Middleware/route-protectie live geverifieerd** via de browser-preview
    (onterecht bereiken van `/klant/home` en `/barber/dashboard` zonder
    sessie wordt correct naar de eigen-rol login geredirect, publieke
    routes blijven bereikbaar). De volledige registratie → bevestigingsmail
    → login-ronde kon **niet** live getest worden: Supabase's gratis
    ingebouwde mailservice heeft een lage rate limit die tijdens het testen
    is opgebruikt. Geen enkele testgebruiker is daadwerkelijk aangemaakt.
    Gebruiker test dit zelf zodra de limiet reset is (~1 uur) of zodra
    custom SMTP is ingesteld — meld het als er iets misgaat.
  - **Architectuur-voorbereiding barber-verificatie** (2026-07-17, op
    verzoek van de gebruiker, nog binnen Fase 1): `barber_status` uitgebreid
    met `suspended` (`supabase/migrations/0002_barber_status_suspended.sql`),
    betekenis van alle vier statussen gedocumenteerd (zie PROJECT.md). Geen
    adminpanel, geen goedkeuringsflow, geen klant-zichtbaarheidsfilter en
    geen statusschermen voor barbers gebouwd — dat is expliciet uitgesteld
    tot de fase waarin het adminpanel gebouwd wordt.
- **Fase 2: afgerond.** Volledig boekingensysteem-schema toegevoegd
  (`supabase/migrations/0003_booking_system_schema.sql`), schema-only —
  geen UI-wiring:
  - `barber_profiles`/`customer_profiles`: puur additieve 1:1-extensies op
    `profiles` (geen wijziging aan Fase 1). Signup-trigger
    (`handle_new_user`) uitgebreid via `create or replace` om de juiste
    extensierij aan te maken.
  - `services`, `bookings`, `payments`, `reviews`, `disputes`,
    `notifications` — enums/relaties/indexes, plus RLS + kolom-grants per
    tabel volgens hetzelfde patroon als `profiles` (payments/disputes-
    resolutie/notifications-insert zijn bewust niet client-schrijfbaar).
  - Geldbedragen als integer cents, snapshot-velden op `bookings` zodat
    latere service-wijzigingen oude boekingen niet breken.
  - RLS-recursion opgelost met `public.is_approved_barber()` (zie regel 10
    hierboven) — services/barber-profielen zijn al filterbaar op
    `barber_status = 'approved'`, nog niet gebruikt in de UI.
  - Rating gecached op `barber_profiles` via trigger op `reviews`-inserts.
  - `npm run build`/`npm run lint` ongewijzigd schoon (geen app-code
    aangepast). Migratie zelf niet live tegen een DB getest (geen
    DB-toegang vanuit mijn kant) — gebruiker voert 0003 uit in de Supabase
    SQL Editor, na 0001/0002.
- **Fase 3: afgerond.** Barber-onboarding echt werkend gemaakt
  (`supabase/migrations/0004_barber_verification.sql` +
  `/barber/aanmelden`, `/barber/werkgebied`, `/barber/beschikbaarheid`,
  `/barber/in-behandeling`):
  - Nieuwe kolommen op `barber_profiles`: `avatar_url`, `diploma_url`,
    `availability` (simpele dag-aan/uit JSONB-map, geen aparte tabel — de
    UI biedt nog geen tijdvakken per dag aan).
  - Twee Storage-buckets: `barber-media` (publiek, avatar/portfolio) en
    `barber-documents` (privé, ID/verzekering/diploma), RLS gescopet op
    `{userId}/...`-pad = `auth.uid()`. Nieuwe helper
    `src/lib/supabase/storage.ts` (`uploadBarberFile`).
  - `/barber/aanmelden` laadt/prefilled nu bestaande data, uploadt echt
    naar Storage (4 tegels, incl. een **nieuwe "Verzekering"-tegel** die
    niet in het originele designpakket zat maar expliciet in de Fase
    3-roadmap stond), en schrijft bij versturen naar `profiles`,
    `barber_profiles` en `services` (services: delete + re-insert, geen
    natuurlijke unique-constraint voor upsert).
  - `/barber/in-behandeling` toont nu de echte `barber_status`
    (pending/rejected/suspended eigen copy, approved redirect naar
    dashboard) — laat alleen de eigen status zíen, wijzigen blijft Fase 10.
  - `npm run build`/`npm run lint` schoon.
  - **Migraties toegepast (2026-07-17)**: gebruiker heeft `npx supabase
    login` → `link --project-ref xzlppuvfgfjxeqdmrmsu` → `db push`
    gedraaid (Supabase CLI toegevoegd als devDependency, `supabase init`
    gedraaid — zie ook `supabase/config.toml`). Alle 9 tabellen en beide
    Storage-buckets geverifieerd aanwezig (zie verificatiemethode hieronder
    onder "RLS/Storage verifiëren zonder service role key").
  - **Volledig end-to-end getest (2026-07-17)** met twee echte testaccounts
    (klant + barber, e-mail handmatig bevestigd via
    `update auth.users set email_confirmed_at = now() where email = ...` —
    het dashboard van deze Supabase-versie had geen directe "confirm
    email"-knop). Bevestigd werkend: registratie, login, rol-scheiding in
    beide richtingen (live, niet alleen met een lege sessie), uitloggen,
    en de volledige barber-aanmeldflow incl. **4 echte bestandsuploads**
    naar Storage (getest via `DataTransfer`-injectie op de hidden file-
    inputs, zie techniek hieronder). `/barber/werkgebied` en
    `/barber/beschikbaarheid` bevestigd persistent na page-reload.
    Wachtwoord-vergeten niet volledig te testen (mailquota opnieuw
    geraakt), foutafhandeling daarvan wel bevestigd correct.
  - **Bug gevonden en gefixt tijdens dit testen**: dagvolgorde op
    `/barber/beschikbaarheid` sprong na de eerste save van chronologisch
    (Ma-Zo) naar alfabetisch — Postgres JSONB garandeert geen
    sleutelvolgorde. Fix: vaste `DAY_ORDER`-array i.p.v. `Object.keys()`.
- **Fase 4: afgerond.** Boekingssysteem echt werkend gemaakt
  (`supabase/migrations/0005_booking_status_machine.sql`,
  `0006_lock_down_approved_barbers_view.sql` + alle klant/barber-
  boekingsschermen):
  - **Statusmachine als database-trigger** (`check_booking_status_transition`)
    — valideert elke overgang op toegestane stap + juiste actor
    (customer/barber). Zie regel 10/12 hierboven voor het patroon.
  - `approved_barbers`-view + `get_booking_customer_name()` — zelfde
    `security definer`-patroon als `is_approved_barber()`, laat klant en
    barber elkaars naam zien zonder `profiles`-RLS te verruimen.
  - Query/mutation-helpers in `src/lib/supabase/queries.ts`:
    `getApprovedBarbersWithServices`, `createBooking`,
    `updateBookingStatus`, `getBooking`, `getActiveBookingForCustomer`,
    `getPendingRequestForBarber`, `getActiveBookingForBarber`,
    `getRecentBookingsForBarber`, `getBookingCustomerName`,
    `getCustomerProfile`.
  - Cross-scherm state via query-params (`?service=`, `?barberId=`,
    `?serviceId=`, `?bookingId=`) — nieuw patroon, zie regel/sectie
    "Fase 4 — architectuur" in PROJECT.md.
  - `/klant/status` gebruikt polling (4s), geen Realtime-subscriptie.
  - Klant kiest zelf een barber (geen auto-matching) — bewuste
    scope-afbakening t.o.v. Fase 5.
  - `npm run build`/`npm run lint` schoon.
  - **Volledig end-to-end getest (2026-07-18)**: klant boekt een echte
    barber → barber accepteert → doorloopt en_route/arrived/in_progress/
    completed → klant ziet elke wijziging live via polling. Annuleren
    getest (nieuwe boeking, customer-cancel). Trigger-blokkade live
    bevestigd: een directe API-call die een `completed`-boeking terugzet
    naar `requested` gaf exact de verwachte foutmelding
    ("Ongeldige statusovergang voor klant: completed -> requested").
  - **Twee bugs gevonden en gefixt tijdens testen**: (1)
    `approved_barbers`-view was door Postgres' default-privileges ook
    voor anon leesbaar (zie regel 12) — 0006. (2) servicetag "Baard" op
    `/klant/home` matchte niet met de echte servicenaam "Baard trimmen" →
    verkeerde dienst geselecteerd, gefixt door de tag-namen exact te
    laten matchen met `DEFAULT_SERVICES` in `barber/aanmelden`.
  - Voor testen: een barber moet handmatig op `approved` gezet worden
    (geen adminpanel nog) — zie "Admin-goedkeuring van barbers" hieronder.
- **Fase 5: afgerond.** Automatische matching toegevoegd
  (`supabase/migrations/0007_matching.sql` +
  `src/app/api/geocode/route.ts` + nieuwe helpers in `queries.ts` +
  gewijzigde `barber/dashboard`, `barber/aanvraag`, `klant/barbers`,
  `klant/boeking`, `klant/notificaties`). Zie "Fase 5 — architectuur" in
  PROJECT.md voor de volledige toelichting (geocoding-keuze, broadcast/
  claim-RLS, notificatie-trigger, klant-flow, barber-aanvraag-modi).
  `npm run build`/`npm run lint` schoon.
  - **Migratie toegepast (2026-07-18)**: gebruiker heeft `npx supabase db
    push` gedraaid voor `0007_matching.sql`.
  - **Volledig end-to-end getest (2026-07-18)**: zie het statusblok
    bovenaan PROJECT.md voor het volledige testverslag. Kort samengevat:
    automatische matching (geocoding → dichtstbijzijnde barber →
    prijsindicatie), broadcast-claim door de barber (tweemaal, beide
    correct), klant-notificatie bij acceptatie, open-blijven van een
    verlopen/niet-geclaimde broadcast-aanvraag, en het "geen barbers
    gevonden"-pad — allemaal live bevestigd. De race-conditie op
    daadwerkelijk gelijktijdig claimen kon niet met een geconstrueerde
    parallelle-fetch-test bevestigd worden (liep vast op een verlopen
    sessie-JWT door de versnelde klok van deze test-sandbox tijdens een
    lange sessie) — de atomische SQL-garantie zelf is wel grondig
    doorgenomen bij het schrijven van de migratie. Genoteerd als
    vervolgpunt in PROJECT.md.
  - **Testaccounts via de Supabase Admin API aangemaakt**, niet via de
    normale `signUp()`-flow: de gratis mailquota-rate-limit (zelfde
    probleem als Fase 1) blokkeerde herhaaldelijk nieuwe registraties.
    Nieuwe regel: gebruik `POST {url}/auth/v1/admin/users` met de
    **service role key** (nooit door Claude zelf uit te voeren — de
    gebruiker draait dit command zelf, zie regel 7) en `user_metadata:
    {role, full_name, phone}` + `email_confirm: true` om dit volledig te
    omzeilen. De Supabase Studio-"Add user"-knop werkt hier expliciet
    **niet** voor: die geeft geen `user_metadata` mee, en
    `handle_new_user()` (0001) verwacht een niet-lege `role`
    (`profiles.role` is `not null`) — zonder metadata faalt de trigger en
    dus de hele user-aanmaak ("Database error creating new user").
- **Fase 6: afgerond.** Stripe Connect + escrow toegevoegd
  (`supabase/migrations/0009_stripe_escrow.sql` +
  `0010_fix_bookings_payments_rls_recursion.sql` + vijf nieuwe Route
  Handlers onder `src/app/api/stripe/` en `src/app/api/cron/` +
  `src/lib/pricing.ts`, `stripe.ts`, `stripe-client.ts`,
  `supabase/service.ts` + gewijzigde `klant/betaling`, `klant/succes`,
  `klant/status`, `klant/annuleren`, `barber/profiel`,
  `barber/uitbetalingen`, `barber/verdiensten` + nieuw scherm
  `klant/geschil`). Zie "Fase 6 — architectuur" in PROJECT.md voor de
  volledige toelichting (Connect Express-accounts, het
  separate-charges-and-transfers-escrowpatroon, de sequencing-fix voor
  barber-zichtbaarheid, het 24-uurs geschillenvenster, automatische
  refund bij annuleren). `npm run build`/`npm run lint` schoon.
  - **Migraties toegepast (2026-07-18)**: gebruiker heeft `npx supabase db
    push` gedraaid voor `0009` en, na een tijdens testen gevonden
    RLS-recursiebug (zie regel 15), ook voor `0010`.
  - **Volledig end-to-end getest (2026-07-18)**: zie het statusblok
    bovenaan PROJECT.md voor het volledige testverslag. Drie echte bugs
    gevonden en gefixt tijdens dit testen (RLS-recursie tussen
    `bookings`/`payments`, dubbele PaymentIntent door React 19 Strict
    Mode, crashende i.p.v. per-boeking afgehandelde mislukte Stripe
    Transfer in de release-cron — zie regels 15/16 en "Fase 6 —
    architectuur"). Live bevestigd: een echte testbetaling (bevestigd via
    Stripe's API met de testbetaalmethode `pm_card_visa`, zie regel 17)
    maakte de boeking pas ná de webhook zichtbaar voor de barber, die de
    volledige rit doorliep met echte bedragen op
    verdiensten/uitbetalingen; een geannuleerde betaalde boeking kreeg een
    echte, volledige Stripe-refund; een geschil binnen het 24-uursvenster
    blokkeerde de automatische vrijgave, en na resolutie rapporteerde de
    vrijgave-job correct dat de barber nog niet Stripe-gekoppeld was.
    Stripe Connect account-aanmaak en de Account Link-redirect zijn
    bevestigd te werken; het interactief invullen van Stripe's eigen
    gehoste KYC-onboardingformulier kon niet geautomatiseerd worden (zie
    regel 17) — genoteerd als vervolgpunt in PROJECT.md.
- **Fase 7: afgerond.** Reviews gekoppeld aan echte UI
  (`supabase/migrations/0012_reviews.sql` + nieuwe query-helpers
  `createReview`/`getReviewForBooking`/`getReviewsForBarber` in
  `queries.ts` + herbouwde `klant/review`, gewijzigde `klant/status`,
  `barber/reviews`, `barber/profiel`). Zie "Fase 7 — architectuur" in
  PROJECT.md voor de volledige toelichting — het schema/RLS/de
  rating-trigger bestonden al sinds Fase 2, puur nooit aangeroepen.
  Zelfde `security definer`-patroon als `get_booking_customer_name`
  (regel 10) hergebruikt voor `get_barber_reviews()` (reviewer-naam
  tonen zonder profiles-RLS te verruimen). De volledig decoratieve
  fooi-knop uit het oude mock-scherm is met de gebruiker afgestemd
  verwijderd (geen backend, niet in de roadmap-eis). `npm run
  build`/`npm run lint` schoon.
  - **Migratie toegepast (2026-07-18)**: gebruiker heeft `npx supabase db
    push` gedraaid voor `0012`.
  - **Volledig end-to-end getest (2026-07-18)**: een 5-sterren-review met
    tekst op een afgeronde boeking werkte de barber's `rating_avg`/
    `rating_count` meteen bij (trigger voor het eerst aangeroepen),
    zichtbaar op `/barber/reviews` (met de echte reviewer-naam),
    `/barber/profiel` en `/klant/barbers` (die laatste was al sinds
    Fase 4 bedraad, toonde meteen echte cijfers zonder wijziging). De
    "al beoordeeld"-staat en het verdwijnen van de review-knop op
    `/klant/status` zijn beide bevestigd.
- **Fase 8: afgerond.** Notificaties toegevoegd
  (`supabase/migrations/0013_notifications_fase8.sql` +
  `src/lib/resend.ts`, `src/lib/push.ts`, `public/sw.js` + nieuwe route
  `src/app/api/notifications/send/route.ts` + gewijzigde
  `klant/instellingen`, `barber/profiel`, `barber/dashboard` + nieuw
  scherm `barber/notificaties` + gedeelde `NotificationsList`-component).
  Zie "Fase 8 — architectuur" in PROJECT.md voor de volledige toelichting
  (het centrale fan-out-trigger-patroon, welke bron welk notificatietype
  vult, de bewust weggelaten broadcast-fan-out, Resend/Web Push-opzet).
  `npm run build`/`npm run lint` schoon.
  - **Migratie toegepast (2026-07-18)**: gebruiker heeft `npx supabase db
    push` gedraaid voor `0013`.
  - **Volledig end-to-end getest (2026-07-18)**: alle vier voorheen nooit
    geschreven notificatietypen (`new_request`, `payment_received`,
    `review_reminder`, `dispute`) kregen een werkend schrijfpad, bevestigd
    via een echte betaling, een echt geopend geschil en een handmatige
    aanroep van de review-reminder-cron (incl. dedup bij herhaald
    aanroepen). Eén echte bug gevonden en gefixt tijdens dit testen: de
    Resend SDK gooit geen exception bij een API-fout (`{ data, error }`
    i.p.v. throw) — de send-route rapporteerde daardoor `"sent"` terwijl
    er nul mails verstuurd waren, ontdekt door Resend's eigen `/emails`-
    lijst-API te bevragen i.p.v. op de eigen "succes"-response te
    vertrouwen. Ná de fix bevestigd: een echte mail kwam daadwerkelijk aan
    (tijdelijk getest tegen het eigen accountadres, verplicht in Resend's
    sandbox-modus zonder geverifieerd domein). Beide notificatieschermen
    (klant + nieuw barber-scherm) en de dashboard-bell bevestigd werkend.
    **Niet volledig te testen**: live push-aflevering, omdat de
    browser-testtool `Notification.permission` vast op `"denied"` heeft
    staan (geen promptbare staat) — het subscribe-pad faalt wel bevestigd
    netjes bij geweigerde toestemming. Genoteerd als vervolgpunt in
    PROJECT.md.
- **Fase 9: afgerond.** Wallet & Loyaliteit toegevoegd
  (`supabase/migrations/0014_wallet_loyalty_fase9.sql` +
  `0015_fix_wallet_topup_notification_locale.sql` + `src/lib/wallet.ts` +
  nieuwe route `src/app/api/wallet/create-topup-intent/route.ts` +
  gewijzigde `src/app/api/stripe/webhook/route.ts` en
  `create-payment-intent/route.ts` + nieuwe gedeelde componenten
  `src/components/wallet/{WalletOverview,TopupCheckout,TopupSuccess}.tsx`
  + nieuwe schermen `klant/wallet`/`barber/wallet`
  (elk met `opwaarderen` + `opwaarderen/succes`) + gewijzigde
  `klant/profiel`, `barber/profiel`, `klant/register`, `barber/register`,
  `klant/betaling`). Abonnementen bewust buiten scope gehouden (afgestemd
  met de gebruiker vóór de bouw), zie "Bekende gaps" in PROJECT.md. Zie
  "Fase 9 — architectuur" in PROJECT.md voor de volledige toelichting
  (het ledger-patroon, waarom de wallet losstaat van het
  boekingsbetaalproces, de kortingscode-correctie in de Stripe-webhook,
  de referral-bonus-timing). `npm run build`/`npm run lint` schoon.
  - **Migraties toegepast (2026-07-19)**: gebruiker heeft `npx supabase
    db push` gedraaid voor `0014` en `0015`.
  - **Volledig end-to-end getest (2026-07-19)**: opwaarderen boven de
    bonusdrempel (€100 → €10 bonus, twee ledger-rijen, saldo correct) en
    eronder (€10 → geen bonus); een echte kortingscode (10%) verlaagde
    het daadwerkelijke Stripe-bedrag correct (€40,25 → €36,22), de
    `payments`-rij kreeg het juiste `discount_cents`, barber-payout bleef
    ongewijzigd, en hergebruik door dezelfde gebruiker werd terecht
    geweigerd; loyaliteitspunten correct verdiend (klant wel, barber
    niet) en correct in te wisselen (incl. beide weigeringspaden);
    referral-bonus (€5/€5) correct toegekend bij de eerste afgeronde
    boeking van een referee en terecht niet opnieuw bij een tweede
    boeking; een RLS-steekproef bevestigde dat de anon-rol nul toegang
    heeft en een ingelogde gebruiker geen ander walletsaldo kan lezen.
    Eén echte bug gevonden en gefixt tijdens dit testen: de opwaardeer-
    notificatie gebruikte een `to_char`-format dat altijd een punt als
    decimaalteken gaf ("€100.00") i.p.v. de komma die de rest van de
    Nederlandstalige UI gebruikt — gefixt in migratie `0015`.
    **Niet via de UI te automatiseren**: het daadwerkelijk invullen van
    Stripe's Payment Element-iframe (zelfde bekende beperking als de
    Stripe Connect-onboarding uit Fase 6) — betalingen zijn in plaats
    daarvan bevestigd door de al aangemaakte PaymentIntents rechtstreeks
    via de Stripe API te confirmen met een test-kaarttoken, wat exact
    hetzelfde webhookpad triggert als een echte UI-betaling.
- **Fase 10: afgerond.** Admin Dashboard toegevoegd
  (`supabase/migrations/0016_admin_fase10.sql` + `src/lib/supabase/
  admin.ts` + gewijzigde `src/middleware.ts` + nieuw, gedeeld
  `src/app/geschorst/page.tsx` + nieuwe routegroep `src/app/admin/*`
  (`layout`, `login`, `page`, `barbers`, `geschillen`, `betalingen`,
  `reviews`, `kortingscodes`, `gebruikers`, `logboek`) + `src/components/
  admin/AdminShell.tsx` + nieuwe routes `src/app/api/admin/*`). Zie
  "Fase 10 — architectuur" in PROJECT.md voor de volledige toelichting
  (het losstaande `admin_users`-identiteitsmodel, de toegangsbeveiliging,
  het schorsen-mechanisme, het logboek). `npm run build`/`npm run lint`
  schoon (incl. een kleine, losstaande fix: `.next/**` ontbrak in
  `eslint.config.mjs`'s ignores, waardoor gegenereerde buildbestanden
  werden gelint — toegevoegd).
  - **Migratie toegepast (2026-07-19)**: gebruiker heeft `npx supabase db
    push` gedraaid voor `0016`.
  - **Volledig end-to-end getest (2026-07-19)**: **twee echte bugs
    gevonden en gefixt tijdens dit testen**, allebei dezelfde
    permissie-valkuil: `admin_users` heeft (terecht) nul client-grants,
    maar zowel `middleware.ts`'s `/admin/*`-gate als de gedeelde
    `requireAdmin()`-helper (gebruikt door élke `/api/admin/*`-route)
    deden de `admin_users`-lookup aanvankelijk met de sessie-client
    i.p.v. de service role — dat gaf altijd `permission denied` terug,
    ook voor een echte admin. Vóór de fix kon dus helemaal niet worden
    ingelogd (gate 1 stuurde na een geslaagde Supabase-login stil terug
    naar `/admin/login`) en gaf elke admin-actie een 403 (gate 2). Beide
    gefixt door voor die specifieke lookup `createServiceClient()` te
    gebruiken, met de sessie-client nog steeds verantwoordelijk voor
    "wie roept er aan" (`auth.getUser()`). Ná de fix bevestigd: een
    echte adminlogin, en dat een klant/barber die naar `/admin` navigeert
    stil naar de eigen home gaat. Barber goedkeuren/schorsen bevestigd
    (incl. dat `/geschorst` een geschorste barber ook echt uit
    `/barber/*` weert, niet alleen uit matching). Een geschil
    "terugbetalen aan klant" leverde een echte Stripe-refund op met
    `bookings.status` bevestigd ongewijzigd op `completed`. Kortingscode
    aanmaken/deactiveren bevestigd. Review verwijderen bevestigd, incl.
    de nieuwe `on_review_deleted`-trigger die de barber-rating correct
    herberekende. Klant schorsen/herstellen bevestigd via een echte
    tweede sessie (`/geschorst` bij schorsing). Het logboek bevatte na
    afloop een correcte, chronologische rij voor elke actie hierboven.
- **Fase 11: afgerond.** Productie-hardening: security headers + CSP
  (`next.config.ts`, CSP alleen actief bij `NODE_ENV=production`),
  ontbrekende `src/app/{error,global-error,not-found}.tsx`, Sentry
  (`@sentry/nextjs` — `src/instrumentation.ts`, `src/
  instrumentation-client.ts`, `src/sentry.{server,edge}.config.ts`, bewust
  zonder `SENTRY_AUTH_TOKEN`/sourcemap-upload), rate limiting op de
  kwetsbaarste routes (`src/lib/rate-limit.ts`, Upstash Redis —
  `/api/geocode`, `/api/stripe/create-payment-intent`, `/api/wallet/
  create-topup-intent`, alle `/api/admin/*`-mutatieroutes), SEO-basis
  (`src/app/{robots,sitemap}.ts`, OG/Twitter-metadata in `layout.tsx`,
  placeholder-favicon `src/app/icon.tsx`), `next/image` voor Storage-
  afbeeldingen. Zie "Fase 11 — architectuur" in PROJECT.md voor de
  volledige toelichting, het env-vars-overzicht en de checklist voor
  live gaan. `npm run build`/`npm run lint` schoon.
  - **Tijdens het bouwen bijgestelde aanname**: de plan-aanname dat de
    escrow-release-cron nog "handmatig" draaide klopte niet — Fase 6
    had daar in `0011_escrow_release_cron.sql` al een echte
    `pg_cron`/`pg_net`-scheduled job voor. Een voorgenomen `vercel.json`-
    cron is daarom bewust **niet** gebouwd (zou dupliceren); in plaats
    daarvan staat in PROJECT.md's checklist dat `app_config.api_base_url`
    na de eerste deploy bijgewerkt moet worden.
  - **Browser-geverifieerd (2026-07-19)**: `error.tsx` vangt een
    geforceerde `throw` op (getest via een tijdelijke, meteen weer
    verwijderde testpagina) en toont de NL-foutpagina; `not-found.tsx`
    toont nette NL-copy op een onbestaand pad (bevestigd via screenshot);
    `/robots.txt`/`/sitemap.xml` serveren correct; de security headers
    staan op elke response, de CSP staat bewust uit in `next dev`. Rate
    limiting kon niet tegen een echte 429 getest worden (vereist een
    Upstash-database, pas relevant ná deploy) — wél bevestigd dat de
    helper zonder Upstash-credentials stilzwijgend "geen limiet"
    teruggeeft, dus lokaal ontwikkelen niet blokkeert.
  - Roadmap is hiermee **compleet** (Fase 0 t/m 11). Wacht op de
    gebruiker voor eventuele vervolgstappen (zie "Openstaande acties voor
    jou" in PROJECT.md voor de accounts/livegang-checklist).
- **Pre-launch audit: afgerond (Critical/High).** Volledige codebase-
  doorlichting vóór echte livegang — architectuur, beveiliging, RLS,
  Stripe/escrow, performance, matching, notificaties, reviews,
  adminpanel, foutafhandeling, UX. Vier gespecialiseerde reviewers liepen
  parallel; elke Critical- en de meeste High-bevindingen zijn daarna zelf
  opnieuw geverifieerd door de betreffende policy/grant/trigger/route te
  lezen vóórdat er iets gefixt werd. Drie Critical (een `bookings`-INSERT
  die élk veld ongecontroleerd doorliet — nep-reviews + prijsmanipulatie
  mogelijk; een barber die zelf `stripe_payouts_enabled` kon zetten via
  een te brede kolom-grant; boekingen die permanent op `arrived`/
  `in_progress` konden vastlopen met escrowgeld en geen enkel herstelpad)
  en tien High-bevindingen zijn direct gefixt. Zie "Pre-launch audit —
  architectuur" in PROJECT.md voor de volledige toelichting per fix,
  inclusief het "wat ik niet end-to-end kon testen"-voorbehoud (geen
  testaccount-credentials deze sessie). `npm run build`/`npm run lint`
  schoon. Migratie `0017_prelaunch_audit_fixes.sql` gepusht door de
  gebruiker (2026-07-19).
- **Post-audit fixes: afgerond.** Tijdens echt gebruik door de gebruiker
  (nadat testaccounts werden aangemaakt) kwamen twee problemen boven die
  de audit niet had gevonden — zie regel 22 hieronder en "Post-audit
  fixes" in PROJECT.md voor de volledige toelichting: (1) een regressie
  in `handle_new_user()` sinds Fase 10 die `barber_profiles`/
  `customer_profiles`-rijen niet meer aanmaakte, gefixt + backfilled in
  `0018_fix_missing_profile_extensions.sql`; (2) `middleware.ts` dwingt
  nu ook `pending`/`rejected`-barbers naar `/barber/in-behandeling` af
  (was voorheen alleen zichtbaar, niet afgedwongen — een barber kon
  zichzelf gewoon online zetten zonder ooit goedgekeurd te zijn).
  Bevestigd via een echte browsersessie. `npm run build`/`npm run lint`
  schoon. Migratie `0018` — nog te pushen door de gebruiker.
- **Verdere live-gebruik-fixes: afgerond.** "Demo · states"-secties
  verwijderd uit `barber/profiel` (incl. de risicovolle link terug naar
  `/barber/aanmelden`, zie regel 20) en `klant/profiel`. `/barber/
  dashboard` mistte polling voor nieuwe aanvragen (liep maar één keer,
  bij page-load) — nu elke 5s, zelfde patroon als `/klant/status`.
  `/klant/home` toont nu een "Lopende boeking"-kaart (via de sinds Fase 4
  ongebruikte `getActiveBookingForCustomer()`) die naar `/klant/status`
  linkt — daarvoor was die statuspagina alleen bereikbaar via de link op
  `/klant/succes`, direct na betalen, en onvindbaar zodra je wegnavigeerde.
  Alle drie bevestigd via een echte browsersessie. `npm run build`/
  `npm run lint` schoon. Zijdelings gevonden, niet gefixt: `Card.tsx`
  heeft dezelfde a11y-tekortkoming die `Row`/`Checkbox`/`Radio`/`Dialog`
  al hadden vóór de pre-launch-audit-fix (regel 20 e.v.) — gemist bij die
  ronde.
- **"Plan in"/matching/adressuggesties: afgerond.** "Plan in" op `/klant/
  boeking` bleek geen logica-bug (`setAsap` wisselde altijd correct) —
  de daaropvolgende native date/time-inputs waren alleen ongestileerd en
  onzichtbaar in een 13px-rij; vervangen door gelabelde `Input`-
  componenten. "Geen barbers beschikbaar" bleek ook geen bug: matching
  vereist zowel `is_online` als dat de huidige weekdag in de barber's
  `availability`-schema aanstaat, en `"Zo": false` is de kolom-default
  sinds `0004_barber_verification.sql` — actie voor de gebruiker: "Zondag"
  aanzetten op `/barber/beschikbaarheid` indien gewenst. Nieuw: adres-
  suggesties tijdens typen op `/klant/home` en `/klant/boeking`, via een
  nieuwe `AddressAutocomplete`-component + `/api/address-suggest`-route
  die naar **PDOK Locatieserver** proxyt (bewust niet Nominatim/`/api/
  geocode` — diens gebruiksvoorwaarden verbieden autocomplete-gebruik
  expliciet). Alle drie bevestigd via een echte browsersessie (incl. een
  volledige auto-match-boeking die na het aanzetten van "Zondag" op een
  testbarber meteen slaagde). `npm run build`/`npm run lint` schoon.
- **"Lopende boeking"-banner bleef staan na annuleren: afgerond.** Niet
  reproduceerbaar via normale klikroutes/browser-terug in de testomgeving
  (query en `useEffect` bleken bij elke echte re-mount correct) — wel
  proactief afgedekt tegen de bekende oorzaak (mobiele bfcache, vooral
  iOS Safari, herstelt de pagina zonder re-mount): `pageshow`-listener op
  `/klant/home` die bij `event.persisted` de actieve boeking herophaalt.
  Bevestigd via een gesimuleerde bfcache-restore (booking server-side
  cancelled, daarna synthetic `pageshow`-event) — banner verdween direct.
  `npm run build`/`npm run lint` schoon.
- **Vervolg: banner bleef alsnog staan — dit keer een echt datagat,
  afgerond.** De `pageshow`-fix loste niet de daadwerkelijke oorzaak op:
  een dag-oude testboeking stond nog gewoon op `requested` (nooit
  beantwoord, nooit geannuleerd) — de banner toonde terecht een reële,
  eerder onzichtbare vergeten aanvraag. Handmatig opgeruimd. Structureel
  gefixt met een 30-minuten-timeout: nieuwe migratie `0019_expire_stale_
  requests.sql` (pg_cron elke 5 min, zelfde `app_config`/`CRON_SECRET`-
  opzet als de escrow-release-cron uit 0011) + nieuwe Route Handler
  `/api/cron/expire-stale-requests` die verlopen `requested`-boekingen
  atomisch claimt, annuleert (`cancelled_by = null`, systeem heeft geen
  actor-rol) en eventueel al betaalde bedragen terugstort via Stripe.
  `notify_customer_on_status_change()` uitgebreid met een derde tak voor
  `cancelled_by is null` (informeert klant + evt. barber). `npm run
  build`/`npm run lint` schoon. Migratie `0019` — nog te pushen door de
  gebruiker.
- **Drie kleinere live-gebruik-fixes: afgerond.** Rating/"Vandaag" op
  `/barber/dashboard` waren hardgecodeerde mock-waarden (`"4,9"`/`"€128"`)
  uit de design-fase, nooit vervangen bij het wiren in Fase 4 — nu
  gekoppeld aan `barber_profiles.rating_avg` resp. `getPaymentsForBarber()`
  (zelfde bron als `/barber/verdiensten`). Geschillen: nieuwe "Bericht
  sturen"-knop (klant/barber/beide) op `DisputesTable`, verstuurt e-mail
  via bestaande Resend-integratie (`POST /api/admin/disputes/message`,
  nieuw) i.p.v. direct meteen terugbetalen/uitbetalen te moeten kiezen —
  bewust e-mail i.p.v. in-app chat (met gebruiker afgestemd), gelogd in
  `admin_action_log`. `/klant/status` toonde de barbernaam al tijdens
  "Aanvraag verstuurd" bij een directe boeking (was geen databug — `barber_
  id` staat dan al vast) — op verzoek toch pas tonen zodra de barber
  daadwerkelijk geaccepteerd heeft; naam-fetch losgetrokken van de
  eenmalige page-load naar een aparte `useEffect` zodat het ook reageert
  op latere poll-ticks. Alle drie bevestigd via een echte browsersessie.
  `npm run build`/`npm run lint` schoon. Geen migratie nodig.
- **Vier verdere live-gebruik-fixes: afgerond.** "Recent" op `/klant/
  home` was nog steeds hardgecodeerde mock-data ("Yusuf El Amrani") —
  nieuwe `getRecentCompletedBookingsForCustomer()` (twee losse queries,
  `approved_barbers` is een view zonder PostgREST-embed), "Opnieuw" boekt
  dezelfde barber+dienst direct opnieuw. `AddressAutocomplete` vereiste
  een dubbele klik op een suggestie: het selecteren zette `value`, wat de
  gedebouncete fetch opnieuw triggerde en de net-gesloten dropdown ~350ms
  later weer opende — gefixt met een `skipNextFetchRef`-guard. `/klant/
  status` had de barbernaam-prefix (vorige fix, regel 20 e.v.) niet
  overal weggehaald — stond nog bij "Knipbeurt bezig" ("Randy Veel
  plezier!"); bleek sowieso grammaticaal fout voor bijna elke status, dus
  nu volledig verwijderd i.p.v. per-status gepatcht. `/api/admin/
  disputes/resolve` informeerde nooit een van beide partijen over de
  uitkomst — insert nu een `notifications`-rij voor klant én barber na
  zowel "refund" als "dismiss" (hergebruikt het bestaande `'dispute'`-
  type en dus ook de bestaande fan-out-trigger, in-app + e-mail voor
  beide "gratis"). Alle vier bevestigd via een echte browsersessie
  (geschil-fix zelfs end-to-end via een los testadmin-account, echt via
  de UI-route ingelogd). `npm run build`/`npm run lint` schoon. Geen
  migratie nodig.
- **Polling crashte op een tijdelijke netwerkstoring: afgerond.** Een
  `TypeError: Failed to fetch` in de 5s-poll op `/barber/dashboard` kwam
  onafgevangen in de Next-foutoverlay terecht. Bleek een patroon dat in
  alle vier de `setInterval`-pollingen in de app zat (`barber/dashboard`,
  `klant/status`, `klant/succes`, `wallet/TopupSuccess`) — geen enkele had
  een try/catch om de Supabase-call, dus een falende `fetch()` (netwerk
  kort weg, laptop uit stand-by, dev-server-herstart) gooide een
  onafgevangen exception i.p.v. dat de eerstvolgende tick het gewoon
  opnieuw probeerde. Alle vier voorzien van try/catch (de twee "wacht op
  betaling"-pollingen tellen een mislukte tick nog wel mee richting hun
  timeout). Bevestigd door `window.fetch` 6s te patchen zodat elke
  Supabase-call faalt op een live ingelogde barber-sessie: geen
  onafgevangen fout, pagina bleef werken, polling hervatte vanzelf.
  `npm run build`/`npm run lint` schoon. Geen migratie nodig.
- **Drie nieuwe live-gebruik-fixes: afgerond.** Nieuwe `NotificationBell`
  (`src/components/shared/`) toont een rood bolletje op de bel-knop
  (`/klant/home`, `/barber/dashboard`) zodra er een ongelezen notificatie
  is — nieuwe lichte `hasUnreadNotifications()` (head-only count-query).
  "Recent" op `/klant/home` bleef alsnog verouderd na de vorige fix: de
  `pageshow`-restore-listener ververste alleen `activeBooking`, niet
  `recentBookings` — samengevoegd in één `loadHomeData()`. "Gepland"-tab
  op `/klant/barbers` deed zichtbaar niets: veranderde alleen `asap` voor
  de boeking, nooit de getoonde lijst, en "Beschikbaar" per rij was een
  hardgecodeerde string (nooit gekoppeld aan `is_online`). `BarberListItem`
  kreeg een echte `isOnline`; "Nu" filtert nu op online barbers, "Gepland"
  toont iedereen met een echte "Nu beschikbaar"/"Nu niet online"-status.
  Alle drie bevestigd via een echte browsersessie. Zijdelings gevonden
  tijdens het bouwen hiervan, apart uitbesteed als losse taak (niet zelf
  gefixed in deze ronde): `barber_profiles` had een kolomloze SELECT-grant
  aan `authenticated` — elke klant kon via een rechtstreekse PostgREST-
  call (i.p.v. de veilige `approved_barbers`-view) iemands volledige
  profiel lezen, incl. IBAN/KvK/documenten. Gefixt in `0020_lock_down_
  barber_profiles_columns.sql` (kolom-grant beperkt tot veilige velden +
  `is_online`, plus `get_own_barber_profile()` zodat een barber zijn eigen
  volledige profiel blijft zien). `npm run build`/`npm run lint` schoon.
  Migraties `0019` + `0020` — nog te pushen door de gebruiker.
- **Regressie van `0020` — "Aanvraag versturen is niet gelukt": afgerond.**
  Twee bookings-RLS-policies (`0010`, barber-kant van de matching-flow)
  subquery'en `barber_profiles.lat`/`lng` rechtstreeks i.p.v. via een
  security-definer-functie — precies regel 10, nu op kolomniveau: `0020`
  liet `lat`/`lng` bewust buiten de grant, maar miste deze twee policies
  die er nog rechtstreeks van afhingen. Trof élke boekingspoging (de
  insert doet een `.select()` erna die dezelfde policies evalueert), niet
  alleen barbers. Gefixt in `0021_fix_bookings_rls_barber_profiles_grant.
  sql`: nieuwe `barber_matches_location_and_service()`-boolean-functie,
  policies aangepast om die te gebruiken. Live gereproduceerd vóór de fix
  (gepatchte `fetch()` in de browser om de onderliggende `42501`-foutmelding
  te zien i.p.v. alleen de generieke UI-tekst) — root cause dus hard
  bevestigd. Migratie nog te pushen; dekt met `0019`/`0020` in één
  `db push`.
- **Drie nieuwe live-gebruik-fixes: afgerond.** "Recent" op klant/home was
  na twee eerdere pogingen (mount, `pageshow`) nóg steeds verouderd —
  bleek Next.js' eigen client-side router-cache: terugnavigeren naar een
  bezochte route kan de component-instantie herstellen zonder remount én
  zonder `pageshow`-event (dat is puur browser-bfcache, een ander
  mechanisme). Opgelost door ook op `focus`/`visibilitychange` te
  verversen — bevestigd met een synthetic `focus`-event (bewust niet
  `pageshow`, om het nieuwe pad te bewijzen). "Knip + baard" → "Knippen +
  baard" hernoemd in `SERVICE_TAGS`/`DEFAULT_SERVICES` + backfill van
  bestaande `services`-rijen (klant-tag matcht exact tegen de servicenaam,
  zie bestaand commentaar in klant/home) — zonder backfill zou de exacte
  match voor barbers die zich al hadden aangemeld blijven mislukken.
  Nieuw: `bookings.party_size` (1–6, default 1), stepper op klant/boeking,
  zichtbaar op barber/aanvraag en barber/rit. Alles in `0022_service_
  rename_and_party_size.sql`. `npm run build`/`npm run lint` schoon.
- **Vervolg: "Aantal personen" faalde alsnog na `0022` — nieuwe oorzaak,
  afgerond.** Elke boeking met `party_size` expliciet in de payload
  (dus altijd) faalde met `42501 permission denied for table bookings`;
  zonder dat veld (kolom-default) ging het wél door — leek daardoor
  willekeurig. Eerst nagelopen of de andere, inmiddels afgeronde
  achtergrondsessie (`barber_profiles`-kolom-lockdown) de oorzaak was via
  het volledige sessietranscript (637 berichten) — bleek zich uitsluitend
  tot `barber_profiles` te beperken, `bookings` nooit aangeraakt. In
  plaats daarvan bleek `bookings` ergens een kolom-beperkte INSERT-grant
  te hebben gekregen die in **geen enkel migratiebestand** hier
  terug te vinden is — vermoedelijk een los/onafgemaakt script buiten de
  migratiegeschiedenis om. Live geïsoleerd via `curl` (authenticated
  klantsessie): een mislukt request veld voor veld teruggebracht tot het
  minimale verschil — alleen `party_size` bleek de trigger. Gefixt in
  `0023_restore_bookings_insert_grant.sql` (ongerestricteerde INSERT-grant
  hersteld, zoals oorspronkelijk in 0003 — geen kolomrestrictie nodig
  voor `bookings`, `set_booking_snapshot_on_insert` uit 0017 overschrijft
  toch al alle veiligheidskritieke velden server-side). Gepusht en
  bevestigd via zowel het exacte eerder falende `curl`-request als een
  volledige browsersessie (3 personen via de stepper, aanvraag verstuurd,
  correct geland op `/klant/betaling`, `party_size: 3` klopt in de
  database). De afgeronde achtergrondsessie is op verzoek gearchiveerd.
- **"Aantal personen" afgemaakt: prijs, duur, bezet-status, gedeeltelijke
  terugbetaling: afgerond.** Prijs en duur schalen nu allebei server-side
  met `party_size` in `set_booking_snapshot_on_insert()` (`0024`, `0025`
  — volledige body herhaald per regel 22 hierboven, elke keer). Barber
  wordt automatisch uitgesloten van nieuwe matches zolang hij een actieve
  boeking heeft (`barber_is_online_and_available()`, ook `0025`). Admin
  kan bij `party_size > 1` een gedeeltelijke terugbetaling doen
  (`refundPeopleCount` in `/api/admin/disputes/resolve`) — de barber
  wordt dan meteen (niet pas via de escrow-cron) proportioneel uitbetaald
  voor de niet-terugbetaalde personen, geblokkeerd met een duidelijke
  melding als de barber nog niet Stripe-gekoppeld is (zie ook de
  Bekende-gaps-aantekening in PROJECT.md over waarom die tak niet
  end-to-end getest kon worden). Alle vier onderdelen vooraf met de
  gebruiker afgestemd via `AskUserQuestion`, op zijn expliciete verzoek
  om bijkomstigheden voortaan proactief te bespreken i.p.v. er pas
  achteraan te fixen. Eén echte bug gevonden en gefixt tijdens dit
  testen: de refund-stepper in `DisputesTable.tsx` gebruikte in de
  `setState`-updater een closure over de oude component-state i.p.v. de
  `c` die de updater zelf binnenkrijgt — twee snelle klikken telden
  daardoor maar één stap. Zie "Aantal personen" in PROJECT.md voor de
  volledige toelichting. `npx tsc --noEmit`/`npm run lint` schoon.
  Migratie `0025` — al gepusht door de gebruiker tijdens deze sessie.
- **"2951 weken geleden" op klant/home — afgerond.** Root cause: 2
  boekingen hadden `status = 'completed'` maar `completed_at = null`
  (restanten van het eerdere onafgemaakte losse script, niet een bug in
  de normale flow — die zet `completed_at` altijd server-side via de
  trigger uit `0009`). Postgres sorteert `NULL` **vóóraan** bij `order by
  ... desc`, dus deze kapotte rijen kwamen bovenaan "Recent" te staan i.p.v.
  onderaan, en `new Date(null)` gaf epoch 1970 → "2951 weken geleden".
  Gefixt met een defensieve `.not("completed_at", "is", null)`-filter in
  `getRecentCompletedBookingsForCustomer()` (queries.ts) — voorkomt dat
  dit nog een keer kan gebeuren, ook als er ooit weer corrupte data
  binnenkomt. De 2 kapotte rijen + de boeking die ik deze sessie zelf
  aanmaakte voor het testen hierboven zijn verwijderd (incl. cascade naar
  payments/disputes/notifications; `loyalty_ledger_entries` heeft geen
  `on delete cascade` naar `bookings`, dus die 3 ledger-rijen zijn apart
  verwijderd vóór de boekingen-delete). Bevestigd via een echte
  browsersessie: "Recent" toont nu de eerstvolgende twee echte
  afgeronde boekingen ("2 d geleden"). `npx tsc --noEmit`/`npm run lint`
  schoon. Geen migratie nodig (query-only fix + eenmalige data-cleanup).
- **Volledige test-data-reset (2026-07-23), op verzoek van de gebruiker**:
  alle `bookings` (22), `notifications` (61), `loyalty_ledger_entries` (8),
  `wallet_ledger_entries` (5), `wallet_topups` (1) verwijderd; `payments`/
  `reviews`/`disputes`/`discount_code_redemptions` cascadeden automatisch
  mee vanuit `bookings` (de `on_review_deleted`-trigger uit `0016` vuurde
  daardoor ook per verwijderde review en herberekende `barber_profiles.
  rating_avg`/`rating_count` correct terug naar `null`/`0`, bevestigd).
  `wallets.balance_cents`/`loyalty_points` en `discount_codes.uses_count`
  zijn losse caches die niet automatisch meeschalen met een cascade-delete
  — die zijn apart teruggezet naar `0`. Alle bestaande accounts (klant/
  barber/admin-logins, incl. Test Klant/Test Barber) blijven gewoon
  bestaan; `admin_action_log` is bewust **niet** gewist (op verzoek).
  `services`/`barber_profiles`-stamgegevens (KvK, werkgebied, etc.) ook
  ongemoeid. Puur eenmalige data-cleanup via de service role, geen
  migratie of code-wijziging.
- **Meerdere diensten per boeking + favorieten + offline-barber-
  waarschuwing: afgerond.** Drie afzonderlijke, met de gebruiker
  vooraf afgestemde features (`AskUserQuestion` voor refund-model,
  party-size-vervanging, offline-gedrag, favorieten-tab):
  - **Meerdere diensten + aantal per dienst** (bv. 2x Kids + 1x
    Knippen+baard) — grootste stuk, echte architectuurwijziging.
    `party_size` en `bookings.service_id` zijn volledig verwijderd;
    nieuwe `booking_services`-tabel (one-to-many, alleen leesbaar door
    klant/eigen-barber, geen enkele schrijf-grant voor `authenticated`).
    `bookings.price_cents_snapshot`/`duration_minutes_snapshot` blijven
    bestaan als AGGREGAAT (som over alle regels) en
    `service_name_snapshot` wordt een samenvattingstekst ("2x Kids,
    Knippen + baard") — zo blijven de tientallen schermen die deze
    velden al los uitlazen ongewijzigd werken. Nieuwe
    `create_booking_with_services()` (security definer) is sinds deze
    migratie de **enige** manier om een boeking aan te maken —
    `bookings`' insert-grant voor `authenticated` is ingetrokken (regel
    20 hierboven dus nog steviger dichtgetimmerd dan met de oude
    trigger: geen kolom meer waar de client ook maar iets aan kan
    sleutelen). `barber_matches_location_and_service()` en
    `find_nearest_eligible_barber()` (broadcast/auto-match-RLS resp.
    de prijsindicatie-RPC) matchen nu op *alle* regels/servicenamen
    i.p.v. één exacte naam. Klant/home: tikken op een diensttag toont
    nu een oplopend telletje-bolletje (1, 2, 3…) i.p.v. een simpele
    aan/uit-selectie; meerdere tags tegelijk actief = meerdere diensten
    in de aanvraag. Admin-geschillen: gedeeltelijke terugbetaling gaat
    nu per dienst-regel i.p.v. per totaal-aantal-personen.
  - **Favorieten**: nieuwe `customer_favorite_barbers`-tabel (eigen
    RLS, geen invloed op matching). Toevoegen via een hartje op elke
    barberrij in `klant/barbers` én op het review-scherm bij 4-5
    sterren. `klant/barbers`' tweede tab hernoemd van "Gepland" naar
    "Boek vooruit"; "Favorieten" is een nieuwe derde tab (bewust niet
    ter vervanging — anders verdwijnt de "vooruit plannen met eender
    welke barber"-functie).
  - **Offline-barber-waarschuwing**: `klant/boeking` roept nu
    `barber_is_online_and_available()` aan voor een direct-gekozen
    barber (dekt zowel de normale keuze via `klant/barbers` als
    "Opnieuw" vanuit Recent, die voorheen linea recta naar dit scherm
    ging zonder ooit de online-status te tonen) en toont een duidelijke
    banner als die barber offline/bezet is — blokkeert het versturen
    niet (barber kan binnen het 30-min-venster alsnog reageren), maakt
    het probleem alleen zichtbaar i.p.v. een stil genegeerde aanvraag.
  - Volledig end-to-end geverifieerd via een echte browsersessie +
    directe RPC/RLS-checks: multi-dienst-aanvraag (direct én
    broadcast/auto-match, incl. een barber die 'm daadwerkelijk claimt
    via de herschreven RLS-policy), volledige Stripe-betaling en
    -terugbetaling op de aggregaat-bedragen, de nieuwe
    Stripe-Connect-guard bij een gedeeltelijke per-regel-terugbetaling
    (kon niet end-to-end met een echte uitbetaling getest worden — geen
    van de testbarbers heeft Stripe Connect gekoppeld — wel bevestigd
    dat de blokkade correct en met een duidelijke melding afslaat),
    offline-warning-banner, en de favorieten-toggle/tab. `npx tsc
    --noEmit`/`npm run lint` schoon. Migratie `0027` — al gepusht door
    de gebruiker tijdens deze sessie (samen met `0026_favorite_
    barbers.sql`).
- **Twee live-gebruik-fixes op de multi-diensten-feature: afgerond.**
  (1) Auto-match toonde bij meerdere diensten pas ná het klikken op
    "Bevestig aanvraag" wat er eigenlijk was aangevinkt (kaal "…"
    ervoor) — de oude versie toonde de aangetikte dienstnaam altijd al
    meteen. `klant/boeking` toont nu bij `auto` + nog geen matchresultaat
    alvast de gekozen diensten uit `wantedServices` met "Bij matching"
    als prijs, i.p.v. een placeholder-rij. (2) "Kids" stond wel als tag
    op klant/home maar zat nooit in `DEFAULT_SERVICES`
    (`barber/aanmelden`) — geen barber had 'm dus ooit als echte
    boekbare dienst, waardoor automatisch toewijzen met "Kids"
    aangevinkt terecht (maar zeer verwarrend) altijd "geen barber
    gevonden" gaf, ook los van deze sessie se wijzigingen. Nu
    toegevoegd aan `DEFAULT_SERVICES` (€20/20 min) + backfill voor al
    goedgekeurde barbers in `0028_add_kids_service.sql` (zelfde patroon
    als de "Knip + baard"-backfill in `0022`). Beide bevestigd via een
    echte browsersessie (multi-dienst-auto-match met een Huissen-adres
    matchte meteen correct nadat bleek dat de eerdere "geen barber"-
    melding puur aan de ontbrekende Kids-dienst lag, niet aan de nieuwe
    matching-logica zelf). `npx tsc --noEmit`/`npm run lint` schoon.
    Migratie `0028` — nog te pushen door de gebruiker.
- **Stripe-webhook-gat lokaal gevonden en gefixt (2026-08-xx)**: een
  betaalde boeking bleef onzichtbaar voor de barber omdat er lokaal geen
  `stripe listen --forward-to localhost:3000/api/stripe/webhook` draaide
  — `payment_intent.succeeded` bereikte de server dus nooit, er ontstond
  geen `payments`-rij, en `booking_has_payment()` hield de boeking terecht
  verborgen (geen codebug). Gefixt door `stripe listen` te starten en het
  gemiste event met `stripe events resend <id>` opnieuw af te vuren.
  Geen migratie/code-wijziging — puur een lokale-dev-omgevingsstap, geen
  structurele fix nodig (in productie draait de webhook altijd echt).
- **Live gegaan op Vercel (2026-08-xx).** Project had nog geen git-repo;
  `git init`, gecontroleerd dat `.gitignore` `.env*.local` al uitsloot,
  gepusht naar `github.com/randylucassen/Barberapp` (gebruiker deed de
  eigenlijke push zelf via een Personal Access Token — wachtwoord-auth is
  door GitHub uitgefaseerd). Geïmporteerd op Vercel, gedeployed met
  test-mode Stripe-sleutels (bewust, om eerst te kunnen itereren) →
  `barberapp-vz1z.vercel.app`. `app_config.api_base_url` in Supabase
  bijgewerkt naar deze URL zodat de bestaande escrow-release-`pg_cron`-job
  (sinds Fase 6) daadwerkelijk gaat vuren — bevestigd via een directe
  `curl` naar de cron-endpoint met `CRON_SECRET`. Security headers/CSP en
  `robots.txt` bevestigd correct aanwezig in productie.
  **Veiligheidsincident tijdens deze stap, direct verholpen**: bij het
  aanmaken van een productie-Stripe-webhook-endpoint kwam de signing
  secret per ongeluk zichtbaar in een Bash-tool-output terecht (regel 7 /
  "nooit secrets in chat" geschonden). Direct dat endpoint verwijderd,
  een nieuw endpoint aangemaakt met de output alleen naar een lokaal
  scratchbestand (nooit getoond, meteen verwijderd, alleen booleaans
  geverifieerd dat er een `whsec_`-string in zat), en de gebruiker zelf
  de echte waarde uit het Stripe-dashboard laten overnemen. Deze regel
  blijft hard: bij elke toekomstige secret-aanmaak-actie de output nooit
  laten printen, altijd naar een scratchbestand omleiden of de gebruiker
  naar de bron-UI verwijzen.
- **PhoneShell — twee losse responsive-bugs op een echt toestel, beide
  afgerond.** Alleen zichtbaar op de gebruiker's eigen iPhone (via een
  in-app-browser vanuit de Notities-app), niet reproduceerbaar in welke
  simulator/emulatie dan ook: (1) **hoogte** — `min-h-dvh` (buiten) en een
  losse `h-dvh` (binnen) evalueerden onafhankelijk van elkaar en liepen op
  dat toestel uiteen, met een grijze `#EDEFF1`-strook tot gevolg. CSS
  `dvh` volledig losgelaten; `PhoneShell` is nu een client component die
  `window.innerHeight` meet (`resize`/`orientationchange`-listeners) en
  als inline `style` toepast — bewust niet `visualViewport.height` (die
  krimpt zodra het toetsenbord opent, wat de hele shell dan ongewenst zou
  verkleinen). (2) **breedte** — `max-w-phone` (390px) miste de `sm:`-
  prefix die zijn hoogte-tegenhanger (`sm:h-[844px]`) wel had, dus elk
  toestel breder dan 390 CSS-px (Pro Max-modellen, veel Android) werd
  gecentreerd met grijze balken links/rechts. Gefixt met `sm:max-w-phone`
  — dit keer wél reproduceerbaar in de browser-tool's eigen emulatie op
  430px, bevestigd via `getBoundingClientRect()` vóór/na. Beide gepusht
  en live bevestigd op `barberapp-vz1z.vercel.app`.
- **Adres en persoonlijke gegevens bewerkbaar in instellingen: afgerond.**
  `klant/instellingen` en `klant/profiel` hadden statische mockup-rijen
  voor "Adressen"/"Persoonlijke gegevens" (nep-tekst, geen `onClick`) —
  de backend-kolommen (`customer_profiles.default_address`,
  `profiles.full_name`/`phone`) hadden al langer client-update-grants
  (sinds resp. `0003` en `0001`) maar er was nooit een schrijf-functie of
  scherm voor gebouwd. Nieuw: `updateDefaultAddress()`/
  `updatePersonalInfo()` in `queries.ts`, nieuwe schermen `klant/adres`
  (hergebruikt `AddressAutocomplete`) en `klant/gegevens` (naam/telefoon
  bewerkbaar, e-mail bewust read-only met een verwijzing naar
  contact-opnemen — e-mail-wijzigen raakt Supabase Auth zelf, niet in
  scope). "Betaalmethoden" toont nu eerlijk "Binnenkort beschikbaar"
  i.p.v. nep-kaartgegevens — bewust niet gebouwd: elke betaling loopt nu
  via een verse Stripe PaymentIntent per boeking, er bestaat geen Stripe
  Customer-object en geen SetupIntent-flow, dus opgeslagen betaalmethoden
  vereisen echt nieuwe Stripe-architectuur (uitgesteld, met de gebruiker
  afgestemd). Beide schermen end-to-end bevestigd via een echte
  browsersessie + directe DB-verificatie. `npx tsc --noEmit`/`npm run
  lint` schoon. Geen migratie nodig (grants bestonden al). Gepusht naar
  `main` (commit `57fa268`).
- **Herstelknop bij diensten + vooruit-plannen beperkt tot bekende
  barbers: afgerond, migratie nog te pushen.** Twee losse, door de
  gebruiker gevraagde features:
  - **Herstelknop**: op `klant/home` verschijnt onder de dienst-tags nu
    een "Herstel selectie"-link (zichtbaar zodra er iets geselecteerd
    is) die de hele selectie in één klik terugzet naar leeg — voorkomt
    dat een verkeerde tik (aantal te vaak opgehoogd, verkeerde dienst)
    alleen te herstellen was door elke tag individueel weer weg te
    tikken.
  - **Vooruit plannen alleen bij bekende barbers**: een nieuw account
    kan een specifieke barber pas kiezen op de "Boek vooruit"-tab
    (`klant/barbers`) zodra er al een afgeronde boeking met die barber
    bestaat — de eerste kennismaking moet altijd via een live aanvraag
    lopen ("Nu"/broadcast-auto-match), niet door vooraf bij een
    wildvreemde in te plannen. Client-side gefilterd (nieuwe
    `getCompletedBarberIdsForCustomer()` in `queries.ts`, met een
    uitlegzin in de lege-staat) én, belangrijker, server-side afgedwongen
    in `create_booking_with_services()` (migratie
    `0029_gate_advance_booking_on_history.sql`, volledige
    `create or replace`-body per regel 22 — alleen de eerste paar regels
    zijn nieuw): een scheduled (`p_requested_asap = false`) boeking met
    een specifieke `p_barber_id` zonder een eerdere `completed`-boeking
    tussen die klant en barber wordt geweigerd met een duidelijke
    Nederlandse foutmelding. Broadcast (`p_barber_id = null`) en
    asap-aanvragen zijn hiervan uitgezonderd — dat gebeurt altijd live,
    ongeacht welke tab de klant gebruikte om er te komen (de check kijkt
    naar de uiteindelijke parameters van de RPC-call, niet naar de
    binnengekomen route — een klant die op `klant/boeking` alsnog "Plan
    in" aanzet bij een net-nu-gekozen onbekende barber wordt dus ook
    tegengehouden). `createBookingWithServices()` in `queries.ts` geeft
    de rauwe RPC-foutmelding nu door aan de UI (`klant/boeking`) i.p.v.
    'm te verzwijgen achter de generieke "niet gelukt"-tekst — specifiek
    voor deze validatiefout is dat relevant, de client-filter dekt het
    gewone pad al af.
  - **Geverifieerd (2026-08-14), migratie `0029` gepusht**: `npx tsc
    --noEmit`/`npm run lint` schoon. Vóór de push al bevestigd dat de
    klant-query correct alleen de bekende barber teruggeeft (echte JWT
    van een vers aangemaakte testklant met één afgeronde testboeking) en
    dat het oude (nog niet gegatete) RPC-gedrag de aanvraag nog gewoon
    doorliet. Ná de push alle vier de RPC-paden rechtstreeks getest met
    diezelfde testklant-JWT: bekende barber + scheduled → slaagt;
    onbekende barber + scheduled → geweigerd met exact de bedoelde
    Nederlandse foutmelding; onbekende barber + asap → slaagt
    (uitzondering werkt); broadcast (`p_barber_id = null`) + scheduled →
    slaagt (uitzondering werkt). Testboekingen en de throwaway
    testklant zijn na afloop opgeruimd.
    **Niet gelukt deze sessie**: browser-UI-verificatie (herstelknop
    aanklikken, "Boek vooruit"-tab live bekijken) — de browser-preview-
    tool bleef vastlopen op elke klik ("Browser pane is currently
    hidden"), ook na een schone herstart van de dev-server en een nieuw
    tabblad; een tool-/omgevingsprobleem, geen appcode-probleem
    (page-tekst/network-logs bevestigden dat de klik nooit aankwam). De
    onderliggende logica is dus wel volledig bevestigd via de echte
    RPC/query-aanroepen, alleen niet pixel-voor-pixel in de gerenderde
    UI — vraag het gerust nogmaals als de tool het een volgende keer wel
    doet.
- **Productie-incident: twee echte aanvragen kwamen niet binnen bij de
  barber (2026-08-14).** Familie van de gebruiker deed op de live
  Vercel-site twee echte boekingen (Westervoort). Root cause: exact
  hetzelfde patroon als de eerder gedocumenteerde lokale Stripe-webhook-
  gap, nu in productie — de betaling slaagde bij Stripe (bevestigd via
  `stripe.paymentIntents.list()`, beide `status: "succeeded"`), maar de
  eerste afleverpoging van het bijbehorende `payment_intent.succeeded`-
  webhook-event naar `barberapp-vz1z.vercel.app/api/stripe/webhook` kwam
  niet aan — geen `payments`-rij, dus `booking_has_payment()` hield de
  boeking terecht (naar ontwerp) onzichtbaar voor de barber (regel 15
  hierboven). De webhook-endpoint zelf bleek correct geconfigureerd
  (juiste URL, juiste secret) — een handmatige `stripe events resend
  <event_id>` voor beide gemiste events slaagde direct, waarna beide
  `payments`-rijen meteen verschenen. Vermoedelijke oorzaak: een
  Vercel-cold-start die de eerste afleverpoging liet timen; Stripe had
  dit vermoedelijk ook zelf binnen de gebruikelijke automatische
  retry-window (minuten tot een uur) opnieuw geprobeerd, maar dat was
  niet snel genoeg voor een live gebruiker die meteen keek. Geen
  codewijziging nodig (de webhook-route zelf bevat geen bug — geen
  rate-limiting erop, verificatielogica correct) — puur operationeel
  hersteld.
  **Vangnet gebouwd (2026-08-14)**: nieuwe `src/lib/payment-reconcile.ts`
  bevat de enige bron van waarheid om een succesvolle PaymentIntent om te
  zetten naar een `payments`-rij (of een verwerkte wallet-topup) —
  `recordSucceededPaymentIntent()`, nu gebruikt door zowel
  `/api/stripe/webhook` (het normale, snelle pad, flink vereenvoudigd
  door de logica hierheen te verplaatsen) als de nieuwe
  `/api/cron/reconcile-payments` (het vangnet). Die laatste haalt elke 2
  minuten (`0030_reconcile_payments_cron.sql`, zelfde
  `app_config`/`CRON_SECRET`-opzet als de bestaande crons) alle Stripe-
  PaymentIntents van het afgelopen uur met `status: succeeded` op en
  verwerkt ze alsnog als er nog geen bijbehorende rij bestaat — idempotent
  (23505-conflict = al verwerkt, geen dubbele actie). Dekt zowel
  boekingsbetalingen als wallet-topups. `npx tsc --noEmit`/`npm run lint`
  schoon. Migratie `0030` — nog te pushen door de gebruiker.
- **Twee losse barber-flow-fixes, gemeld door de gebruiker
  (2026-08-14).**
  - **Reactietijd op een aanvraag te kort**: de client-side countdown op
    `barber/aanvraag` stond op 28 seconden (kennelijk een designfase-
    placeholderwaarde, nooit bewust op afgestemd) — te kort om realistisch
    te kunnen reageren. Verhoogd naar 5 minuten (`RESPONSE_WINDOW_SEC`),
    met een `mm:ss`-weergave i.p.v. kale seconden. De countdown is en was
    al puur client-side (per page-mount) — de boeking zelf blijft gewoon
    `'requested'` in de database totdat er expliciet geaccepteerd/
    geweigerd wordt of de bestaande 30-minuten-timeout (`0019`) 'm
    opruimt, dus wegnavigeren en binnen die tijd terugkomen (via het
    dashboard, dat elke 5s op een openstaande aanvraag polt) verliest de
    aanvraag niet — dat werkte al zo, alleen was het venster te kort om
    er praktisch gebruik van te maken.
  - **Geaccepteerde aanvraag onvindbaar na wegnavigeren**: `barber/
    dashboard` toonde een geaccepteerde boeking wel in de "Vandaag"-lijst
    (met een "Bevestigd"-badge) maar zonder `onClick` — geen enkele weg
    terug naar `/barber/rit` behalve de trigger die er de eerste keer
    naartoe stuurde. De boeking zelf was nooit kwijt (bleef gewoon
    `'accepted'` in de database), alleen de UI bood geen pad terug. Twee
    toevoegingen: (1) een nieuwe "Actieve rit"-kaart bovenaan het
    dashboard (zelfde patroon als de "Lopende boeking"-kaart op
    `klant/home`), gevuld via `getActiveBookingForBarber()` op dezelfde
    bestaande 5s-pollingtick als de aanvraag-check; (2) de "Vandaag"-
    rijen zijn nu klikbaar naar `/barber/rit` zodra de status
    `accepted`/`en_route`/`arrived`/`in_progress` is. Beide routeren naar
    een scherm dat zelf al `getActiveBookingForBarber()` gebruikt (geen
    bookingId-param nodig, Fase 4).
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Browser-
    UI-klikken kon deze sessie opnieuw niet (dezelfde vastlopende
    preview-tool als bij de vorige twee features — omgevingsprobleem, zie
    eerdere aantekening hierboven). Wel hard bevestigd op data-niveau: een
    verse testbarber met een direct in de database op `'accepted'` gezette
    boeking (+ bijbehorende `payments`-rij) liet via een echte, ingelogde
    sessie (niet service role) precies de rij zien die
    `getActiveBookingForBarber()`/`getRecentBookingsForBarber()` client-
    side ook zouden ophalen — de RLS/query-laag waar deze twee nieuwe
    UI-elementen op leunen werkt dus aantoonbaar correct; alleen het
    daadwerkelijke React-klikken/renderen is niet pixel-voor-pixel gezien.
    Testdata na afloop opgeruimd.
- **"Familie krijgt geen mail" — root cause gevonden, geen codebug
  (2026-08-14).** Gemeld: de gebruiker kreeg zelf wel bevestigingsmails
  (aanvraag bevestigd, geld in escrow), familie op een ander adres niet.
  Direct gereproduceerd met een echte testverzending naar het echte
  familie-e-mailadres: Resend weigerde met `403 validation_error` —
  *"You can only send testing emails to your own email address"*. Zonder
  een geverifieerd domein (nog niet gedaan, zie PROJECT.md's
  "Openstaande acties voor jou" — Fase 8) mag Resend's sandbox-modus
  alleen naar het eigen accountadres versturen, exact wat we zagen. Geen
  fix mogelijk zonder een domein + DNS-toegang die ik niet heb — puur een
  actie voor de gebruiker. Wél gefixt: deze fout verdween voorheen stil
  in een ongelezen HTTP-response van de fire-and-forget
  `/api/notifications/send`-route (aangeroepen via `pg_net`, niemand
  keek ooit naar de response) — nu een `Sentry.captureException()` bij
  elke mislukte Resend-verzending, zodat een toekomstig ander
  mail-probleem niet weer onopgemerkt blijft. In-app-notificaties (de
  bel/`/klant/notificaties`) werkten voor de familie wél gewoon — die
  komen uit dezelfde `notifications`-rij, onafhankelijk van of de
  e-mailpoging slaagt. `npx tsc --noEmit`/`npm run lint` schoon. Geen
  migratie nodig.
- **Bel/Bericht-knoppen op barber/rit en klant/status werkend gemaakt
  (2026-08-14).** Beide waren pure designpakket-restanten (geen
  `onClick`) — nooit gekoppeld sinds ze in Fase 4 gebouwd werden. Nu
  echt `tel:`/`sms:`-links naar het telefoonnummer dat de andere partij
  bij registreren heeft opgegeven (`profiles.phone`, sinds `0001`).
  Twee nieuwe security-definer-functies (`0031_booking_contact_phone.sql`)
  — `get_booking_customer_phone()`/`get_booking_barber_phone()` — exact
  hetzelfde patroon/scope als het bestaande `get_booking_customer_name()`
  (0005): alleen de daadwerkelijk toegewezen tegenpartij van díe ene
  boeking mag het nummer zien, `profiles`/`approved_barbers` blijven
  bewust dicht voor telefoon/e-mail (regel 7/23). Beide knoppen zijn
  `disabled` zolang het nummer nog niet geladen is (of ontbreekt).
  `npx tsc --noEmit`/`npm run lint` schoon. Migratie `0031` — nog te
  pushen door de gebruiker.
- **"Amsterdam-adres bij opstarten" — eigen testdata-restant, geen bug,
  + nieuwe "huidige locatie"-knop (2026-08-14).** Root cause: bij het
  bouwen van `klant/adres` eerder deze sessie is `customer_profiles.
  default_address` van het testaccount (`randylucassen@gmail.com`)
  bewust op "Damrak 1, Amsterdam" gezet om de opslaan-flow te verifiëren
  — anders dan bij het telefoonnummer (dat toen wél teruggezet is) is dit
  adres nooit gereset. Rechtstreeks opgeruimd (`default_address = null`).
  Het bestaande prefill-gedrag zelf (`klant/home` vult het adresveld met
  je opgeslagen standaardadres als je die hebt ingesteld) is bewust
  **niet** verwijderd — dat is de eigenlijke, gewenste functie van
  `klant/adres`; zonder een opgeslagen standaardadres begint het veld
  toch al leeg.
  Nieuw, tweede deel van het verzoek: een "gebruik huidige locatie"-knop.
  Toegevoegd binnen `AddressAutocomplete` zelf (niet per aanroepplek) —
  werkt dus meteen overal waar het component al gebruikt wordt
  (`klant/home`, `klant/boeking`, `klant/adres`), geen losse wiring per
  scherm nodig. Vraagt `navigator.geolocation`-toestemming, zet de
  coördinaten om naar een adres via een nieuwe route
  `/api/reverse-geocode` (PDOK Locatieserver, dezelfde gratis/keyless
  NL-overheidsbron als `/api/address-suggest` — bewust niet Nominatim,
  zelfde reden als bij de suggesties tijdens typen). Rate-limited zoals
  de andere publieke adres-route. Nette Nederlandse foutmelding bij
  geweigerde toestemming/geen adres gevonden, knop `disabled` tijdens het
  ophalen.
  **Geverifieerd**: `/api/reverse-geocode` rechtstreeks getest met echte
  coördinaten (Amsterdam/Huissen) — correcte adressen terug. Browser-UI
  werkte deze keer wél (eerdere sessies had de preview-tool problemen):
  bevestigd dat het adresveld na het opruimen leeg start, de knop
  rendert, en een klik de correcte Nederlandse foutmelding
  "Locatietoestemming geweigerd." toont — de testtool staat, net als bij
  Web Push eerder (Fase 8), geen promptbare locatietoestemming toe, dus
  het succespad (toestemming gegeven → adres ingevuld) is alleen via de
  directe API-test bevestigd, niet pixel-voor-pixel in de browser.
  `npx tsc --noEmit`/`npm run lint` schoon. Geen migratie nodig.
- **"Ingelogd blijven" + wachtwoord/gebruikersnaam onthouden
  (2026-08-14).** Sessie-persistentie zelf bleek al standaard aan te
  staan — `createBrowserClient` (`@supabase/ssr`) persist de sessie in
  cookies met automatische token-refresh, geen aparte "blijf ingelogd"-
  toggle nodig of aanwezig om dat gedrag te krijgen (`src/lib/supabase/
  service.ts` zet `persistSession: false` bewust, maar dat is alleen de
  service-role-client voor server-side calls zonder gebruikerssessie —
  niet de browser-client die klant/barber/admin gebruiken). Wél een
  echte, concrete gap gevonden en gefixt: alle vijf auth-formulieren
  (klant/barber/admin-login, klant/barber-register) misten een `name`-
  attribuut op de velden — hadden alleen `autoComplete`. Sommige browsers/
  password-managers herkennen een veld onvoldoende betrouwbaar op enkel
  `autoComplete` om het aanbieden-om-op-te-slaan te triggeren; `name`
  erbij is de robuustere, bredere-compatibiliteit-aanpak. Als "ingelogd
  blijven"/"onthouden" toch niet werkte tijdens testen, is de
  waarschijnlijkste verklaring een ingesloten in-app-browser (bv. vanuit
  de Notities-app, zie de eerdere PhoneShell-bug hierboven) — zo'n
  webview heeft geen eigen wachtwoordmanager/cookie-opslag zoals een
  volwaardige browser. `npx tsc --noEmit`/`npm run lint` schoon. Geen
  migratie nodig.
- **Meldingen (klant/barber) waren niet klikbaar (2026-08-15).** Gemeld:
  op `klant/notificaties` staat "Laat gerust een review achter", maar
  geen manier om erop te klikken of alsnog een review te geven.
  `NotificationsList` (`src/components/shared/`, gedeeld tussen klant en
  barber) rendert de `Row`-items sinds Fase 8 zonder `onClick` — puur
  statisch. `AppNotification.relatedBookingId` was al wel beschikbaar
  (`getNotificationsForUser()` selecteerde 'm al), alleen nooit gebruikt.
  Nieuwe `getHref(notification, role)`-functie mapt elk `notification_
  type` naar een zinnig doel per rol (bv. klant `review_reminder` →
  `/klant/review?bookingId=X`, `accepted`/`en_route`/`arrived`/
  `completed`/`cancelled`/`dispute` → `/klant/status?bookingId=X`,
  `wallet_topup`/`referral_bonus` → `/klant/wallet`; barber `new_request`
  → `/barber/aanvraag`, `payment_received` → `/barber/verdiensten`, etc.)
  — `null` voor types zonder een zinnig scherm, die rijen blijven bewust
  gewoon niet-klikbaar in plaats van te gokken. `NotificationsList` kreeg
  een verplichte `role`-prop (`klant/notificaties`/`barber/notificaties`
  geven 'm nu door) zodat dezelfde melding-type voor de juiste rol naar
  het juiste scherm gaat. Zijdelings gevonden: `NotificationType` in
  `src/lib/types.ts` miste `completed`/`cancelled` — die zaten al langer
  in de echte Postgres-enum (`0017`) maar nooit in de TS-type, gefixt.
  **Geverifieerd end-to-end**: een verse testklant met een echte
  afgeronde boeking + een echte `review_reminder`-notificatie, ingelogd
  via een echte browsersessie — klik op de melding navigeerde correct
  naar `/klant/review?bookingId=...` met de juiste barbernaam ("Hoe was
  Randy?") en een werkend sterren-/tekstformulier. Testdata opgeruimd.
  `npx tsc --noEmit`/`npm run lint` schoon. Geen migratie nodig.
- **Barber kreeg geen melding bij een nieuwe review (2026-08-15).**
  `update_barber_rating()` (0003, trigger `on_review_created`) werkte
  alleen de `rating_avg`/`rating_count`-cache bij op `barber_profiles` —
  nooit een `notifications`-rij, in tegenstelling tot alle andere
  booking-events. Gefixt in `0032_notify_barber_on_review.sql`: nieuw
  enum-lid `review_received` + de trigger-functie (volledige body
  opnieuw, regel 22) stuurt nu ook een melding naar `new.barber_id` met
  het aantal sterren en (indien aanwezig) de reviewtekst, gelinkt aan
  `related_booking_id`. Klikbaar gemaakt in dezelfde beweging als de
  vorige meldingen-fix hierboven: `getHref()` in `NotificationsList`
  routeert `review_received` voor barbers naar `/barber/reviews`.
  `npx tsc --noEmit`/`npm run lint` schoon. Migratie `0032` — nog te
  pushen door de gebruiker.
- **"Vandaag" op barber/dashboard toonde ook gisteren/eergisteren
  (2026-08-15).** `getRecentBookingsForBarber()` haalt de laatste 10
  niet-`requested`-boekingen op ongeacht datum, maar de sectie had een
  hardgecodeerde "Vandaag"-titel — dus letterlijk elke recente boeking
  stond onder "Vandaag", ook eentje van gisteren. Nieuwe `dayLabel()`
  groepeert nu op echte kalenderdag (niet een 24u-venster — 23:50
  gisteren en 00:10 vandaag zijn nog geen etmaal uit elkaar maar horen
  wél in verschillende groepen): "Vandaag"/"Gisteren"/een datum (bv. "13
  augustus") voor ouder. De lijst was al aflopend gesorteerd op
  `created_at`, dus aaneengesloten groeperen volstaat zonder aparte sort.
  **Geverifieerd** met een verse testbarber + drie boekingen op drie
  verschillende dagen (vandaag/gisteren/eergisteren, elk met een
  bijbehorende `payments`-rij zodat RLS ze toont) — live bevestigd dat
  alle drie de labels correct en in de juiste volgorde verschijnen.
  Testdata opgeruimd. `npx tsc --noEmit`/`npm run lint` schoon. Geen
  migratie nodig.
- **Live locatiekaart gebouwd (2026-08-15) — de langst-openstaande
  beslissing in dit project.** Op verzoek van de gebruiker daadwerkelijk
  gebouwd, nu de app live staat. Met de gebruiker afgestemd (via
  `AskUserQuestion` in plan-mode): **Mapbox** als kaart-SDK (gratis tier,
  geen creditcard nodig — past bij de bestaande voorkeur voor
  laagdrempelige diensten zoals Nominatim/PDOK) én **inclusief routelijn
  + ETA** via Mapbox's Directions API (niet alleen twee pins).
  - **Architectuur**: geen Supabase Realtime geïntroduceerd (de app
    gebruikt dat nergens, overal `setInterval`-polling) — drie nieuwe
    kolommen direct op `bookings` (`barber_live_lat`, `barber_live_lng`,
    `barber_location_updated_at`, migratie `0033`), geschreven door de
    barber via `navigator.geolocation.watchPosition()` op `barber/rit`
    (gethrottled, max. 1x/8s — een GPS kan elke seconde ticken), gelezen
    door de klant via de al bestaande 4s-poll van `getBooking()` op
    `klant/status` — geen enkele nieuwe network-roundtrip aan klantkant.
    Kolom-grant zelfde patroon als de bestaande `grant update (status,
    ...)` in `0003`. `bookings.lat/lng` (het klant-adres, al sinds Fase 5
    aanwezig maar nooit teruggelezen naar de client) is bij deze
    gelegenheid ook aan `BookingRecord`/`BOOKING_COLUMNS` toegevoegd —
    nodig als bestemmingscoördinaat voor de kaart.
  - **Nieuw gedeeld component** `src/components/shared/LiveMap.tsx`
    (imperatieve `mapbox-gl`-API, geen React-wrapper-dependency): markers
    voor barber (teal) + bestemming (zwart), `fitBounds` op beide,
    gethrottelde Directions-call voor route/ETA (max. 1x/20s of bij een
    merkbare verplaatsing), een "laatst gezien"-notitie als de laatste
    positie-update ouder dan 2 minuten is. **Zonder
    `NEXT_PUBLIC_MAPBOX_TOKEN` valt dit component vanzelf terug op de
    identieke statische placeholder van vóór deze feature** — geen crash,
    geen kale kaart; dit was een bewuste eis zodat de rest van de app
    nooit kan breken op een ontbrekende/nog-niet-aangevraagde token.
    Ingezet op zowel `klant/status` ("Live kaart") als `barber/rit`
    ("Navigatie"), alleen tijdens `accepted`/`en_route` (barber is
    onderweg) — andere statussen behouden de oude placeholder, een live
    kaart voegt daar niets toe.
  - **Geweigerde locatietoestemming** op `barber/rit` blokkeert de rit
    niet — een niet-blokkerende melding, de barber kan gewoon door de
    rit-stappen heen (zelfde soort degradatie als eerder bij de "gebruik
    huidige locatie"-knop en Web Push).
  - **Belangrijk operationeel verschil met alle eerdere migraties deze
    sessie**: `BOOKING_COLUMNS`/`mapBooking()` in `queries.ts` (gebruikt
    door zo goed als elk boekingsscherm: `klant/status`, `klant/home`,
    `barber/dashboard`, `barber/rit`, etc.) selecteert nu de drie nieuwe
    kolommen. Zonder migratie `0033` gepusht faalt dus **elke**
    boeking-fetch in productie (bevestigd: een `getBooking()`-achtige
    query gaf `42703 column bookings.barber_live_lat does not exist`) —
    niet alleen de nieuwe live-kaart-functionaliteit zelf. Daarom is de
    gebruikelijke volgorde deze keer bewust omgedraaid: de migratie moet
    gepusht zijn **vóórdat** deze code naar `main`/Vercel gaat, niet
    erna (normaal maakt dat niet uit omdat een nieuwe kolom alleen door
    nieuwe, geïsoleerde functies gelezen wordt — hier raakt de wijziging
    een gedeelde kernquery).
  - **Geverifieerd end-to-end (2026-08-16)**, ná de migratie-push: een
    verse testklant/-barber met een `accepted`-boeking, live positie
    geschreven via de barber's eigen sessie (exact wat
    `updateBookingLiveLocation()` doet) en direct daarna via de klant's
    sessie teruggelezen — de juiste coördinaten kwamen aan. Mapbox-token
    zelf ook los bevestigd geldig (rechtstreekse curl naar de Directions
    API gaf een echte route terug). `npx tsc --noEmit`/`npm run lint`/
    `npm run build` schoon.
    **Echte bug gevonden en gefixt tijdens dit testen**: de kaart was in
    de browser onzichtbaar (grijs vlak, geen tegels/markers) terwijl 'm
    intern prima rendered (bevestigd via een DOM-inspectie: canvas had
    inhoud, beide markers bestonden) — `mapbox-gl.css`'s eigen `.mapboxgl-
    map { position: relative }`-regel wint de CSS-cascade van Tailwinds
    `absolute`-class op precies het element waar `mapboxgl.Map()` z'n
    eigen classname aan toevoegt (allebei één-klasse-selectors, mapbox-gl
    z'n stylesheet laadt na Tailwind), waardoor die container zonder
    intrinsieke hoogte instort tot 0px. Gefixt door voor dát specifieke
    element een inline `style={{position:"absolute",inset:0}}` te
    gebruiken i.p.v. een className — inline styles winnen altijd,
    ongeacht laadvolgorde. Ná de fix bevestigd via browser-screenshot:
    kaarttegels, beide pins (bestemming zwart, barber teal) en de teal
    routelijn + zoom-knoppen allemaal zichtbaar. Testdata opgeruimd.
    `npm install mapbox-gl` + `@types/mapbox-gl` toegevoegd.

- **Live locatiekaart werkte nog niet in productie (2026-08-16) — twee
  losstaande, echte bugs gevonden en gefixt, ná een lange
  deploy-diagnose.**
  - **Bug 1 — Vercel's "Sensitive" environment variable wordt niet aan
    de build-stap meegegeven.** `NEXT_PUBLIC_MAPBOX_TOKEN` was per
    ongeluk als "Sensitive" aangemaakt; Next.js bakt `NEXT_PUBLIC_`-vars
    juist tíjdens de build in de clientbundel, dus die token kwam nooit
    aan. Vercel staat niet toe een Sensitive-variabele terug te zetten
    naar gewoon — moet verwijderd en opnieuw aangemaakt worden.
  - **Bug 2 — de eerste verwijder-en-opnieuw-aanmaken-poging is nooit
    daadwerkelijk opgeslagen.** Onduidelijk waarom (mogelijk niet op
    Save geklikt), maar de variabele stond erna die actie gewoon niet
    meer — elke volgende rebuild had dus terecht geen waarde om in te
    bakken, ongeacht hoe vaak geredeployed of gecachet werd. Pas
    zichtbaar geworden door een tijdelijke debug-probe die de rauwe
    `process.env`-waarde zichtbaar in de pagina rendert (zowel server-
    als clientcomponent) — bevestigde dat *andere* `NEXT_PUBLIC_`-vars
    prima inlineden, alleen deze ene niet, wat naar de configuratie zelf
    wees i.p.v. een cache/build-probleem. Opnieuw aangemaakt (niet-
    Sensitive) en ditmaal bevestigd zichtbaar in de variabelenlijst
    vóórdat verder getest werd.
  - **Bug 3 — CSP blokkeerde Mapbox volledig, los van de token-bug.**
    Zodra de token wél aankwam, bleek de Content-Security-Policy (Fase
    11) geen `worker-src` te hebben (viel terug op `script-src`, dat
    geen `blob:` toestaat — mapbox-gl maakt een Web Worker van een
    blob:-URL voor tegelverwerking) en geen `api.mapbox.com`/
    `events.mapbox.com` in `connect-src` — dus elke Mapbox-netwerkaanroep
    en de worker werden stilzwijgend geweigerd door de browser zelf,
    ook met een geldige token. Gefixt in `next.config.ts`: `worker-src
    'self' blob:` toegevoegd, en `api.mapbox.com`/`events.mapbox.com`
    aan zowel `img-src` als `connect-src` toegevoegd.
  - **Waarom dit zo lang duurde om te vinden**: elke afzonderlijke
    Vercel-"Redeploy"-actie in het dashboard bleek de git-commit van de
    deployment die geredeployed werd te hergebruiken (niet per se de
    nieuwste `main`), en de CDN/ISR-cache van het productiedomein bleef
    stug oude JS-bestanden serveren zelfs na "geslaagde" nieuwe
    deployments. De uiteindelijk betrouwbare methode was steeds: een
    verse `git push` naar `main` (triggert Vercel's normale
    GitHub-pipeline, niet de dashboard-Redeploy-knop) + de cache-leeftijd
    (`age`-header) direct met `curl -D-` controleren totdat die op 0
    terugviel, in plaats van op de dashboardstatus alleen te vertrouwen.
  - **Geverifieerd (2026-08-16)**: met een verse wegwerp-testboeking
    rechtstreeks op `barberapp-vz1z.vercel.app` ingelogd (niet lokaal) —
    volledige Amsterdamse straatkaart met beide pins zichtbaar, geen
    console-CSP-fouten meer, alle testdata nadien opgeruimd. Tijdelijke
    debug-probes (`page.tsx`, `LiveMap.tsx`'s `Placeholder`) weer
    verwijderd; het losse `NEXT_PUBLIC_DEBUG_TEST`-variabele mag uit
    Vercel's env-vars verwijderd worden, dient nergens meer voor.
- **Drie bugs uit live gebruik gemeld door de gebruiker, alle drie
  gefixt (2026-08-16).**
  - **"Betaling verwerken duurt heel lang"**: `klant/succes` pollt 30
    seconden (15× om de 2s) op een `payments`-rij, maar **stopte** daarna
    hard met pollen en toonde alleen een statische "duurt langer dan
    verwacht"-tekst — terwijl de bestaande `reconcile-payments`-cron
    (elke 2 minuten, vangnet voor een trage eerste webhook-aflevering,
    zie het 2026-08-14-incident hierboven) de betaling meestal binnen
    afzienbare tijd alsnog bevestigt. De klant zat dus op een dode
    pagina en moest zelf wegnavigeren en terugkomen om het resultaat te
    zien. Gefixt: pollen loopt nu door tot 100 pogingen (~3 minuten,
    ruim boven de cron-cadans), de "duurt langer"-tekst verschijnt nog
    steeds na dezelfde 30s maar het scherm blijft actief checken en
    springt vanzelf door zodra de betaling binnenkomt.
  - **"Klant krijgt 'barber niet online' terwijl de barber wél online
    is"**: `klant/boeking` checkte `barber_is_online_and_available` één
    keer bij het laden van het scherm, nooit daarna. Ging de barber pas
    ná het laden van die pagina online, dan bleef de klant de
    verouderde "niet online"-waarschuwing zien — puur een race tussen
    laadmoment en de daadwerkelijke status, geen block op het boeken
    zelf (dat kon altijd al gewoon doorgezet worden) maar wel verwarrend.
    Gefixt: aparte polling-`useEffect` die elke 5s herchecked, zelfde
    patroon als andere near-realtime schermen in de app.
  - **"'Route wordt berekend' maar er verschijnt nooit een lijn/tijd"**:
    zeer waarschijnlijk grotendeels al opgelost door de CSP-fix
    hierboven in dezelfde sessie (Mapbox's Directions-aanroep werd
    daarvoor stilzwijgend geblokkeerd). Wél een echte, losstaande bug
    gevonden en gefixt: `LiveMap` had geen foutstatus voor een mislukte
    Directions-fetch — bij elke fout (netwerkhapering, tijdelijke
    Mapbox-storing) bleef de tekst voor altijd op "Route wordt
    berekend…" staan i.p.v. iets te tonen dat het opgeven aangeeft.
    Nieuwe `directionsFailed`-state toegevoegd met een "Onderweg"-
    terugval zodra de fetch (blijvend) faalt.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon voor alle
    drie. Geen van de drie kon deze sessie end-to-end in de browser
    gereproduceerd worden (vereist respectievelijk een trage/gemiste
    Stripe-webhook, een barber die precies ná het laden van het
    boekingsscherm online gaat, en een mislukte Mapbox-aanroep — geen
    van drie op afroep te forceren) — puur code-niveau geverifieerd
    tegen de exacte, door de gebruiker beschreven symptomen.
- **Vervolgmelding van de gebruiker op bug #3 hierboven — echte, andere
  root cause gevonden (2026-08-17).** "Duckers Boulant 10, Westervoort"
  ingevuld als adres, maar de live kaart toonde niets herkenbaars en
  centreerde automatisch op Huissen (een ander, nabijgelegen dorp);
  route/ETA bleven nog steeds hangen op "Route wordt berekend…". Niet
  de CSP (die stond al goed) en niet de geocoding zelf (rechtstreeks
  tegen zowel Nominatim als onze eigen `/api/geocode` getest — geeft
  voor dit exacte adres correct Westervoort terug) — het echte probleem
  zat in `klant/boeking`: `handleConfirm()` stuurde `lat`/`lng` alleen
  mee als `auto` (de "automatisch toewijzen"-matchflow) — bij een
  **directe** boeking (een specifieke barber uit de lijst kiezen, de
  gebruikelijkste flow) werd het adres nooit gegeocodet en bleven
  `bookings.lat`/`lng` permanent `null`. Gevolg: `LiveMap` had geen
  bestemming om te tonen, viel terug op de barber's eigen live positie
  als kaartcentrum (leek dan willekeurig — in dit geval Huissen, waar
  de teststbarber toevallig stond), en de Directions-effect's
  guard-clause (`destinationLat == null`) keerde meteen terug zonder
  ooit een aanroep te doen — dus ook de `directionsFailed`-terugval van
  de vorige fix werd nooit bereikt, "Route wordt berekend…" bleef voor
  altijd hangen.
  - **Fix**: `handleStartConfirm()` geocodet het adres nu voor **beide**
    paden (niet alleen `auto`), vóór de bevestig-dialoog opent.
    `handleConfirm()` stuurt `lat`/`lng` nu onvoorwaardelijk mee zodra
    geocoding gelukt is. Knoptekst tijdens het geocoden aangepast
    ("Bezig…" i.p.v. het misleidende "Barber zoeken…" bij een directe
    boeking).
  - **Geverifieerd end-to-end tegen productie (2026-08-17)**: browser-
    UI-klikken bleef onbetrouwbaar (bekende tool-flakiness), dus
    geverifieerd op API-niveau met een echte klant-sessie (niet service
    role) — `/api/geocode?address=...` voor het exacte adres gaf
    `{lat: 51.951352, lng: 5.9735497}` (Westervoort, niet Huissen);
    `create_booking_with_services`-RPC met die coördinaten opgeroepen
    zoals de gefixte client nu doet, en de resulterende boeking had
    exact die `lat`/`lng` opgeslagen. Vervolgens de boeking op
    `accepted` gezet met een testbarber-positie in Arnhem en
    daadwerkelijk in de browser bekeken op `barberapp-vz1z.vercel.app`:
    de kaart centreerde correct op Westervoort (Huissen zichtbaar als
    apart gebied ernaast, niet als bestemming), en de teal routelijn
    van Arnhem naar Westervoort werd getekend — beide onderdelen van
    deze bugmelding nu bevestigd opgelost. Testdata opgeruimd.
- **Geplande boekingen niet meer als "nu" behandelen (2026-08-17).**
  Gemeld: een boeking gepland voor volgende week werd door de barber
  geaccepteerd en meteen behandeld alsof de afspraak nu was — barber
  werd direct de rit-flow in gestuurd (GPS-tracking begon meteen), klant
  zag "Barber komt eraan" + live kaart, en het dashboard toonde de
  boeking als "Actieve rit". Nergens in de code werd na het boeken nog
  naar `scheduled_at`/`requested_asap` gekeken.
  - **Met de gebruiker afgestemd**: optie B — geen nieuwe databasestatus,
    wel een expliciete "Start rit"-stap (geen automatische omschakeling
    op tijd), die pas binnen 2 uur voor `scheduled_at` beschikbaar wordt.
    Plus: een overzicht van geplande afspraken op het barber-dashboard
    (bestond nog niet), een botsingswaarschuwing bij het accepteren van
    een overlappende afspraak (bestond nog niet), en een herinnering
    voor de barber 1 uur van tevoren.
  - **Nieuwe gedeelde helper** `src/lib/booking-timing.ts`:
    `isRideDue(booking)` — waar zodra een geaccepteerde boeking als
    "live"/klaar-om-te-starten mag gelden (altijd waar voor asap of
    voorbij 'accepted', anders pas binnen `RIDE_START_WINDOW_MS` = 2u
    voor `scheduled_at`). Overal hergebruikt waar voorheen puur op
    `status` werd beslist.
  - **`queries.ts`**: `getActiveBookingForBarber()` filtert het resultaat
    nu door `isRideDue()` — een nog-niet-actuele geplande boeking telt
    niet meer als actieve rit (raakt zowel de "Actieve rit"-kaart als
    `/barber/rit`'s eigen fetch-bij-mount, zonder dat laatste scherm zelf
    te hoeven aanpassen). Nieuwe `getScheduledBookingsForBarber()` (het
    omgekeerde filter, voor de nieuwe dashboardsectie) en
    `getConflictingScheduledBooking()` (tijdvak-overlapcheck in JS tegen
    de barber's andere geaccepteerde geplande boekingen — puur
    adviserend, geen db-constraint).
  - **`barber/aanvraag`**: `accept()` checkt bij een niet-asap aanvraag
    eerst op een botsing en toont zo nodig een bevestigingsdialoog
    ("Toch accepteren"/"Annuleer", zelfde `Dialog`-patroon als
    `klant/boeking`). Na een geslaagde accept van een geplande boeking:
    terug naar het dashboard i.p.v. automatisch naar `/barber/rit` (waar
    de GPS-tracking start) — dat gebeurt nu pas zodra de barber zelf op
    de boeking tikt zodra 'm due is.
  - **`barber/dashboard`**: nieuwe "Geplande afspraken"-sectie
    (`getScheduledBookingsForBarber()`, dezelfde 5s-polltick als de rest
    van het scherm). Een item verdwijnt daar vanzelf uit en verschijnt
    als "Actieve rit" zodra `isRideDue()` omslaat — geen apart "Start
    rit"-knopje nodig, de bestaande "Actieve rit"-kaart vervult die rol.
    De "Vandaag"-lijst se tik-naar-rit is nu ook op `isRideDue()` gegate.
  - **`klant/status`**: toont "Afspraak bevestigd — Gepland voor [datum/
    tijd]" i.p.v. de live kaart zolang de boeking geaccepteerd maar nog
    niet due is; schakelt vanzelf om zodra dat wel zo is (geen nieuwe
    markup, de bestaande statische placeholder-tak wordt hiervoor
    hergebruikt).
  - **Migratie `0034_booking_reminders.sql`**: `booking_reminder`
    toegevoegd aan `notification_type`; `trigger_booking_reminders()` —
    zelfde patroon als `trigger_review_reminders()` (0013), puur SQL via
    `pg_cron` elke 5 min, venster 55-65 min voor `scheduled_at`, dedup
    via `not exists ... type='booking_reminder'` (geen nieuwe kolom op
    `bookings`). **Nog te pushen door de gebruiker.**
  - **Geverifieerd (2026-08-17)**: `npx tsc --noEmit`/`npm run lint`/
    `npm run build` schoon. Browser-UI-klikken bleven onbetrouwbaar
    (zelfde bekende tool-flakiness als bij de vorige twee bugfixes deze
    sessie), dus het volledige pad op API-niveau geverifieerd tegen
    productie met echte sessies (niet service role waar RLS het toelaat):
    een geaccepteerde, 3-dagen-vooruit geplande testboeking bleek
    zichtbaar via de exacte `getScheduledBookingsForBarber`-queryvorm en
    afwezig via de exacte `getActiveBookingForBarber`-queryvorm zodra de
    `isRideDue()`-logica (apart met echte tijdstempels doorgerekend) erop
    toegepast wordt; een tweede, overlappende testboeking liet de
    `getConflictingScheduledBooking`-overlapcheck (ook apart
    doorgerekend, inclusief rand-gevallen als exact-aansluitend) correct
    een conflict vinden tegen de eerste. Onderweg ontdekt: de RLS-policy
    "Assigned barbers can update/view paid bookings" blokkeert barber-
    toegang tot een testboeking zonder een echte `payments`-rij — geen
    bug, bevestigt gewoon dat het bestaande "barbers zien pas iets ná
    betaling"-ontwerp (Fase 6) ook hier correct gehandhaafd wordt.
    Testdata opgeruimd.
- **"Betaling verwerken…" bleef consistent (te) lang duren (2026-08-17).**
  Gemeld: elke betaling duurde merkbaar lang voordat `klant/succes` de
  bevestiging toonde — niet incidenteel, maar structureel.
  - **Twee onafhankelijke root causes gevonden**:
    1. `stripe.confirmPayment()` in `klant/betaling` riep geen `redirect`-
       optie mee — Stripe.js' default is `redirect: "always"`, wat
       betekent dat *elke* betaling (ook een kaart zonder 3D Secure-
       stap, die eigenlijk niets hoeft te redirecten) via een volledige
       pagina-rondreis naar een Stripe-gehoste tussenpagina en terug
       ging, i.p.v. direct op de pagina zelf af te ronden.
    2. Ná die rondreis wachtte `klant/succes` puur passief op óf de
       `payment_intent.succeeded`-webhook óf, als vangnet, de
       `reconcile-payments`-cron die maar elke 2 minuten draait (zie het
       2026-08-14-incident hierboven). Als de webhook in productie niet
       snel genoeg binnenkomt — vermoeden, kon niet rechtstreeks
       geverifieerd worden zonder toegang tot het Stripe-webhooklog —
       viel elke betaling terug op die 2-minuten-cadans, wat de
       structurele (niet incidentele) traagheid verklaart.
  - **Fix 1 — onnodige redirect weg**: `handlePay()` in
    `src/app/klant/betaling/page.tsx` roept nu `redirect: "if_required"`
    mee. Betaalmethodes die een redirect daadwerkelijk vereisen (iDEAL
    altijd, een kaart soms bij een 3DS-uitdaging) doen dat nog gewoon;
    de rest rondt nu direct op de pagina zelf af. Bij een geslaagde
    non-redirect-confirm navigeert de pagina zelf naar `/klant/succes`
    met `payment_intent=<id>` in de query — dezelfde parametervorm die
    Stripe sowieso al aanplakt aan de `return_url` bij een redirect, dus
    `klant/succes` hoeft geen onderscheid te maken tussen beide paden.
  - **Fix 2 — actief navragen i.p.v. alleen passief wachten**: nieuwe
    route `POST /api/stripe/confirm-payment`
    (`src/app/api/stripe/confirm-payment/route.ts`) — zelfde
    auth/ownership-check als `create-payment-intent`, haalt de
    PaymentIntent rechtstreeks bij Stripe op (`paymentIntents.retrieve`)
    en roept bij status `succeeded` direct dezelfde
    `recordSucceededPaymentIntent()` aan die de webhook en de
    reconcile-cron ook gebruiken (`src/lib/payment-reconcile.ts`) — geen
    aparte/afwijkende schrijflogica, alleen een derde, snellere trigger.
    `klant/succes` roept dit meteen aan zodra 'ie een `payment_intent`-
    query-param ziet, vóórdat de bestaande DB-polling (elke 2s) start —
    die polling blijft als vangnet staan voor het geval de intent op dat
    moment nog niet `succeeded` is (bv. een net-nog-niet-voltooide iDEAL-
    afhandeling).
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Een
    volledige browser-E2E-test (echte testkaart door de Payment Element
    heen) kon dit keer niet — de preview-devserver crashte meteen bij
    opstarten op een omgevingsfout (`EPERM: process.cwd failed`,
    duidelijk een sandbox-/tool-probleem, niet iets in de code zelf).
    De nieuwe route hergebruikt bewust dezelfde, al eerder end-to-end
    geverifieerde `recordSucceededPaymentIntent()`-functie i.p.v. nieuwe
    schrijflogica te verzinnen, wat het risico beperkt — maar de
    daadwerkelijke snelheidswinst in productie is dus nog niet met eigen
    ogen bevestigd. **Aanbevolen**: na deploy een keer een echte
    testbetaling doen (kaart 4242 4242 4242 4242 in Stripe test-mode) en
    kijken of `klant/succes` nu vrijwel meteen omslaat i.p.v. na een
    volle pagina-redirect + wachttijd.
- **Geplande datum/tijd was nergens zichtbaar bij een vooruit-geboekte
  aanvraag (2026-08-17).** Gemeld: als klant zag je bij het aanvragen niet
  terug welke datum je nou eigenlijk had ingepland, en dat bleef ook later
  onzichtbaar; als barber zag je bij een binnenkomende aanvraag ook niet
  voor wanneer 'ie precies was. Root cause: puur een weergavegat — overal
  stond alleen het generieke label "Ingepland", nooit de daadwerkelijke
  `scheduledAt`, terwijl die data allang gewoon op de boeking stond. Vier
  plekken gefixt:
  - **`klant/boeking`**: nieuwe `formatPlannedLabel(date, time)`-helper.
    De Klok-rij toont nu de gekozen datum/tijd onder "Ingepland" zodra
    beide ingevuld zijn, en de bevestigingsdialoog ("Aanvraag versturen?")
    noemt 'm ook expliciet — voorheen zag de klant nergens terug wat 'ie
    net had getypt vóórdat de aanvraag de deur uit ging.
  - **`klant/status`**: `copy`-berekening kreeg een derde tak naast de
    bestaande "geaccepteerd maar nog niet due"-override (zie de vorige
    changelog-entry) — nu ook tijdens `status === 'requested'` (nog geen
    bevestiging van de barber) toont de sub-tekst "Gepland voor …" i.p.v.
    het generieke "Wachten op bevestiging van de barber", zodra het een
    niet-asap boeking met een `scheduledAt` betreft.
  - **`barber/aanvraag`**: de Klok-`Row` had al een `formatDateTime()`-
    helper (gebruikt in de botsingsdialoog, zie vorige changelog-entry) —
    nu ook hergebruikt als `sub` op die rij zelf, zodat de barber bij het
    accepteren/weigeren meteen het exacte moment ziet i.p.v. alleen
    "Ingepland".
  - **Barber kan een geaccepteerde geplande boeking terugvinden**: dit
    bestond al — de "Geplande afspraken"-sectie op `barber/dashboard`
    (zie de vorige changelog-entry, `getScheduledBookingsForBarber()`)
    toont dit al met datum/tijd. Gecontroleerd en ongewijzigd gelaten,
    geen apart gat gevonden.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Geen
    browser-verificatie mogelijk — de lokale dev-server crasht op
    opstarten met dezelfde omgevingsfout (`EPERM: process.cwd failed`)
    als bij de vorige entry, nog steeds niet iets in de code zelf. Alle
    vier wijzigingen zijn puur weergave van al bestaande, al eerder
    geverifieerde velden (`booking.scheduledAt`, de lokale `date`/`time`-
    inputs) — geen nieuwe databaselogica of queries.
- **Geplande afspraken op barber/dashboard waren niet klikbaar (2026-08-17).**
  Direct gemeld ná de vorige entry hierboven: de barber kon een geaccepteerde,
  nog-niet-due geplande boeking wél zien staan onder "Geplande afspraken",
  maar er verder niets mee — geen contact opnemen, geen annuleren. Dat kón
  vóór deze sessie ook niet (de sectie zelf bestond nog niet), dus dit is
  geen regressie, wel een missend stuk van dezelfde feature.
  - **Nieuw scherm `src/app/barber/afspraak/page.tsx`** (bereikbaar via
    een tik op een kaart in "Geplande afspraken"): toont klantnaam,
    datum/tijd, dienst, adres, opmerking en verdienste — zelfde
    databronnen/patroon als `barber/rit` (`getBookingCustomerName`,
    `getBookingCustomerPhone`, allebei al bestaande security-definer
    RPC's uit 0031). Bel/bericht-knoppen zijn dezelfde `tel:`/`sms:`-
    `IconButton`'s als daar. Als de boeking inmiddels due is geworden
    (barber had dit scherm bv. al open staan) redirect't 'ie meteen naar
    `barber/rit` i.p.v. een inmiddels-verkeerd scherm te tonen.
  - **Nieuw scherm `src/app/barber/afspraak/annuleren/page.tsx`** — zelfde
    opzet als het bestaande `klant/annuleren` (radiolijst + bestaande
    `/api/stripe/cancel-and-refund`-route, die op basis van de sessie zelf
    al bepaalde of de aanroeper klant of barber is en dienovereenkomstig
    `cancelled_by`/volledige refund afhandelt — geen wijziging aan die
    route nodig). Nieuwe `BARBER_CANCEL_REASONS`-lijst in `mock-data.ts`
    (naast de bestaande `CANCEL_REASONS` voor klanten): "Vervoer kapot",
    "Ziek geworden", "Datum verkeerd gelezen", "Dubbele boeking", "Anders".
    Bij "Anders" verschijnt een vrij-tekstveld; de reden wordt dan als
    `Anders: <tekst>` opgeslagen in `cancelled_reason` i.p.v. het kale
    "Anders" dat `klant/annuleren`'s bestaande "Anders"-optie nog steeds
    doet (dat gat bestond al, hier bewust niet meegefixt — puur de
    barber-kant was gevraagd; laat het weten als de klant-kant hetzelfde
    verdient).
  - **`barber/dashboard`**: de kaarten in "Geplande afspraken" kregen
    `onClick` naar `/barber/afspraak?bookingId=` plus een `ChevronRight`-
    icoon als klik-affordance (`Card` ondersteunde `onClick`+cursor-stijl
    al, geen wijziging aan dat component nodig).
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Geen
    browser-verificatie mogelijk (zelfde `EPERM`-omgevingsfout als de
    vorige twee entries). De nieuwe schermen hergebruiken bewust bestaande,
    al geteste bouwstenen (`getBooking`, `getBookingCustomerPhone`, de
    cancel-and-refund-route, het `klant/annuleren`-patroon) i.p.v. nieuwe
    logica te verzinnen, wat het risico beperkt.
  - **Update (zelfde dag)**: het hierboven genoemde gat — `klant/
    annuleren`'s "Anders"-optie sloeg alleen het kale woord "Anders" op,
    geen vrije tekst — is alsnog gelijkgetrokken met de barber-kant.
    Zelfde `isOther`/`customReason`-patroon, zelfde `Anders: <tekst>`-
    opslagformaat. `npx tsc --noEmit`/`npm run lint` schoon; ditmaal ook
    de dev-server zelf beschikbaar (zie de losse entry hieronder) al
    kon de daadwerkelijke klik-doorloop niet — de bekende klik/submit-
    flakiness van de browser-testtool deze sessie trad ook hier weer op
    (typen in een veld werkt betrouwbaar, klikken/submitten regelmatig
    niet). Risico laag: identiek patroon aan de al bestaande barber-versie.
- **Privacybeleid + algemene voorwaarden gepubliceerd (2026-08-18).**
  Nodig voor Stripe live-mode-verificatie, een toekomstige App Store-
  indiening en wettelijke verplichting. Twee nieuwe publieke pagina's:
  `src/app/privacybeleid/page.tsx` en `src/app/voorwaarden/page.tsx` —
  root-niveau routes (niet onder `klant/`/`barber/`), erven dus geen
  `PhoneShell` — zelfde "geen telefoonframe, volle breedte"-keuze als
  `admin/layout.tsx` al maakt voor niet-mobiele schermen. Puur statische
  content, geen nieuwe query's/UI-primitives.
  - **Inhoud afgestemd met de gebruiker**: bedrijfsgegevens (Barbershop
    Noviomagus, eenmanszaak, KvK 83716580, Plein 1944-17, 6511 JC
    Nijmegen), contact `barbershopnoviomagus@gmail.com`. De
    privacyverklaring benoemt concreet welke gegevens verzameld worden en
    waarom (account, adres, live GPS-locatie tijdens een rit,
    betaalgegevens via Stripe, barber-verificatiedocumenten) en welke
    verwerkers data ontvangen (Supabase, Stripe, Resend, Mapbox, Vercel,
    Sentry). De voorwaarden leggen het bemiddelingsmodel vast (barbers
    zijn zelfstandig ondernemer, niet in dienst) en het bestaande
    annuleringsbeleid (gratis tot 1 uur vooraf/barber onderweg, anders 50%
    van het dienstbedrag als compensatie voor de barber — zie de eerdere
    "Late annulering"-entry hieronder).
  - **Belangrijk, nog niet afgerond**: de handelsnaam "Groomy" zelf ligt
    nog niet vast (zie "Openstaande beslissingen" in PROJECT.md) — beide
    nieuwe bestanden hebben hier een verwijzende code-comment bovenaan
    staan. Dit is bovendien een AI-opgesteld concept, geen juridisch
    geverifieerd document — aanbevolen door een jurist te laten
    tegenlezen vóór het als bindend beleid gepresenteerd wordt.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon.
- **Auth-schermen linken nu echt naar de nieuwe documenten (zelfde dag).**
  De registratieschermen (`klant/register`, `barber/register`) hadden al
  langer de tekst "voorwaarden"/"privacybeleid" staan — designpakket-
  restanten zonder `onClick`, nu echte `Link`'s. Beide loginschermen
  (`klant/login`, `barber/login`) kregen een nieuwe voettekst met dezelfde
  twee links (bestond nog nergens op die schermen).
- **Twee kleinere verbeteringen n.a.v. het annuleringskosten-/
  no-show-beleid (2026-08-18).**
  - **Herstelknop op `/admin/no-shows`**: een geschorste barber kon daar
    wel gezien worden, maar terugzetten moest via het aparte
    `/admin/barbers`-scherm. Nieuwe client component
    `src/components/admin/NoShowWarningsList.tsx` (zelfde
    fetch/busy/error-patroon als `BarbersTable.tsx`) met een "Herstel"-
    knop die dezelfde bestaande `/api/admin/barbers/status`-route aanroept
    (`status: "approved"`) — geen nieuwe route nodig. Bijkomende, eerder
    onopgemerkte inconsistentie gefixt: de "Geschorst"-badge werd puur
    afgeleid uit `warningNumber >= 2` (historisch, kan achterhaald zijn
    als een admin al eerder handmatig herstelde) i.p.v. de echte
    `barber_status`. `getNoShowWarningsForAdmin()` (`queries.ts`) haalt nu
    ook `barber_status` op per barber en geeft die als `barberStatus` mee
    in `AdminNoShowRow` — badge én knop-zichtbaarheid gebruiken nu de
    actuele status, niet een afgeleide.
  - **No-show-strikebeleid nu ook in de voorwaarden** (`voorwaarden/
    page.tsx`, hoofdstuk 6): tot nu toe stond dit alleen impliciet in de
    notificatietekst na afloop. Nieuwe alinea legt uit dat een barber die
    bij een geplande afspraak niet binnen 60 minuten bevestigt onderweg te
    zijn een waarschuwing krijgt (klant krijgt volledige refund), en dat
    een 2e waarschuwing tot automatische schorsing leidt.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Geen
    browser-klik-doorloop van de nieuwe herstelknop deze sessie — vereist
    een ingelogde adminsessie waarvan ik de inloggegevens niet heb (bewust,
    zie regel 7). De knop hergebruikt ongewijzigd dezelfde
    `/api/admin/barbers/status`-route die al sinds Fase 10 via
    `BarbersTable.tsx` end-to-end getest is, dus het risico is beperkt tot
    de nieuwe query-uitbreiding (`barber_status` erbij selecteren) en de
    weergavelogica zelf.
- **"Bij Gemiste afspraken staat niets" — echte bug gevonden, geen
  testdata-probleem (2026-08-18).** Gemeld nadat er via een wegwerp-
  testbarber (zie hieronder) daadwerkelijk 2 no-show-waarschuwingen waren
  aangemaakt: `/admin/no-shows` toonde alsnog "Nog geen gemiste
  afspraken." Rechtstreeks met de service role geverifieerd dat de data
  gewoon in `barber_no_show_warnings` stond (2 rijen, barber correct
  `suspended`) en dat de laatste commit al live stond (`/voorwaarden`
  bevatte de nieuwste tekst) — dus geen data- en geen deploy-probleem.
  **Root cause**: `/admin/no-shows/page.tsx` leest geen `searchParams`/
  cookies, dus Next.js rendert 'm statisch tijdens de build — de pagina
  toonde sindsdien permanent de databasestand van bouwmoment (destijds 0
  rijen, want deze feature was net toegevoegd), volledig losgekoppeld van
  de live database. Bij controle bleken **zes van de negen** admin-
  subpagina's hetzelfde lek te hebben: `boekingen`, `geschillen`,
  `kortingscodes`, `logboek`, `no-shows`, `reviews`, plus het
  hoofddashboard (`admin/page.tsx`) — alleen `barbers`/`betalingen`/
  `gebruikers` ontsnapten hieraan toevallig omdat ze `searchParams` lezen
  (filter-query-params), wat Next.js automatisch dynamisch rendert.
  **Fix**: `export const dynamic = "force-dynamic";` toegevoegd aan
  `src/app/admin/layout.tsx` i.p.v. los aan elke individuele pagina — een
  `dynamic`-route-config op een layout cascadeert naar alle onderliggende
  pagina's (Next.js-documentatiegedrag), dus dit dekt in één keer alle
  huidige én toekomstige adminschermen, zonder dat een nieuwe pagina
  straks weer per ongeluk hetzelfde lek erft.
  **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Root cause
  hard bevestigd via directe REST-calls (data aanwezig, deploy actueel)
  vóór de fix geschreven werd — niet geraden. Browser-bevestiging dat
  `/admin/no-shows` na deploy de 2 testrijen toont vereist een
  adminsessie die ik niet heb; gebruiker bevestigt zelf na deze push.
- **Wegwerp-testbarber met 2 no-shows aangemaakt (2026-08-18)**, op
  verzoek, om de nieuwe herstelknop hierboven te kunnen testen.
  Rechtstreeks via de service role (niet via `create_booking_with_
  services()` — die weigert een vooraf-geplande boeking bij een barber
  zonder eerdere afgeronde geschiedenis, zie 0029): twee `bookings`-rijen
  met `status: 'accepted'`, `requested_asap: false`,
  `scheduled_at` >60 min in het verleden, rechtstreeks ingevoegd (de
  `set_booking_snapshot_on_insert`-trigger forceert bij élke insert
  alsnog `status = 'requested'`, dus een losse tweede `update` naar
  `accepted` was nodig — de statusovergang-trigger slaat validatie over
  zodra `auth.uid()` null is, dus dat mislukt niet). Daarna handmatig
  `/api/cron/expire-noshow-bookings` aangeroepen (lokale dev-server, met
  `CRON_SECRET` uit `.env.local` — beide draaien tegen dezelfde
  productiedatabase): 1e boeking gaf een waarschuwing, 2e schorste de
  barber automatisch, precies zoals bedoeld. Testaccount:
  `test@test.nl` / `test1234` (e-mail/wachtwoord op verzoek vereenvoudigd
  van het oorspronkelijke gegenereerde testaccount). **Nog op te ruimen**
  zodra het testen klaar is: barber-profiel, testklant, 2 testboekingen,
  2 `barber_no_show_warnings`-rijen — vraag het me, dan ruim ik ze op.
- **"Bevestigingslink werkt niet" + "e-mails zijn saai" (2026-08-19).**
  Twee losse meldingen, apart onderzocht.
  - **Bevestigingslink**: geen codebug — via de Supabase Admin API
    (`/auth/v1/admin/generate_link`, `type: signup`) het daadwerkelijke
    linkformaat opgevraagd dat naar nieuwe gebruikers gaat:
    `.../auth/v1/verify?token=...&type=signup&redirect_to=http://localhost:3001`.
    De **Site URL** in Supabase's eigen Auth-instellingen (Authentication
    → URL Configuration) staat dus nog op een lokaal ontwikkeladres —
    Supabase verifieert de token prima, maar stuurt de browser daarna naar
    een adres dat voor een echte gebruiker nergens bestaat. Kan ik niet
    zelf fixen (dashboard-instelling, geen API-toegang daarvoor) — actie
    voor de gebruiker: Site URL + Redirect URLs bijwerken naar
    `https://barberapp-vz1z.vercel.app`. Twee wegwerp-testaccounts die
    nodig waren om dit te diagnosticeren zijn meteen weer opgeruimd.
  - **"Saaie" e-mails**: bleek twee gescheiden systemen te zijn. (1) De
    bevestigings-/reset-mail komt rechtstreeks van Supabase's eigen,
    generieke mailservice (nooit Resend) — aan te passen via Authentication
    → Email Templates in het dashboard, buiten mijn bereik. (2) De
    notificatiemails (nieuwe aanvraag, betaling ontvangen, etc.) lopen wél
    via Resend met een eigen template in code — die **is** aangepakt:
    `notificationEmailHtml()` in `src/lib/resend.ts` kreeg een teal
    accentbalk (`#0EA5A4`, 1:1 uit `tailwind.config.ts`), een ronde
    "Bekijk in Groomy"-CTA-knop (nieuwe `getSiteUrl()`-import) en een
    voettekst met de afmeld-uitleg + bedrijfsgegevens (Barbershop
    Noviomagus-adres, consistent met de nieuwe privacyverklaring/
    voorwaarden). Visueel geverifieerd door de gerenderde HTML tijdelijk
    in `public/` te zetten en via de browser-preview te bekijken (daarna
    weer verwijderd) — ronde accentkleur, knop en voettekst renderen
    correct.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Geen
    echte e-mail verzonden (Resend-sandboxbeperking, zie de eerdere
    "Fase 8 — Resend-domein"-aantekening) — puur de HTML-rendering visueel
    bevestigd, niet de daadwerkelijke aflevering.
- **Notificatiemail nogmaals aangepast: groter/vol i.p.v. klein kadertje
  (zelfde dag)**: op verzoek — de vorige versie (bovenstaande entry) was
  nog een klein wit kaartje met afgeronde hoeken op een grijze
  achtergrond. `notificationEmailHtml()` is herzien naar een edge-to-edge
  3-bands-layout op 600px breedte (was 480px): volle-breedte teal
  kopband met het wordmark, witte inhoudssectie met grotere
  titel/body/knop, volle-breedte donkere (`#111111`) voetband — vult
  zo het hele e-mailkanvas i.p.v. een smal kadertje in het midden. Titel/
  body/knop blijven wel `notification.title`/`.body` (geen extra
  boekingsgegevens erbij gehaald) — dat kan een vervolgstap zijn als
  gewenst, nu bewust niet meegebouwd. Ook uitgelegd (gevraagd door de
  gebruiker): de hele e-mail-pijplijn (Resend-notificaties én Supabase's
  auth-mail) is 100% server-side, getriggerd door database-events — de
  overstap naar de React Native-app verandert daar dus niets aan, welke
  client de onderliggende gebeurtenis veroorzaakte maakt voor dit pad
  geen verschil.
  **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon, visueel
  bevestigd via dezelfde tijdelijke-`public/`-bestand-truc (breed
  browserviewport, 700px) — teal kopband, witte sectie, donkere
  voetband renderen allemaal edge-to-edge zoals bedoeld.
- **Offline-barber-waarschuwing gold niet bij uitloggen (2026-08-19).**
  Gemeld: als een barber niet ingelogd is, moet de klant de al bestaande
  offline-waarschuwing op `klant/boeking` zien — niet pas als de barber
  zelf de "Online"-schakelaar had omgezet. Root cause: `is_online`
  (`barber_profiles`) is en was een pure handmatige schakelaar — uitloggen
  (`barber/profiel`) riep alleen `supabase.auth.signOut()` aan en raakte
  die kolom nooit aan, dus een uitgelogde (of gewoon de app afgesloten)
  barber bleef voor `barber_is_online_and_available()` gewoon "online".
  - **Nieuwe migratie `0037_barber_last_active.sql`**: nieuwe kolom
    `barber_profiles.last_active_at`. `barber_is_online_and_available()`
    (volledige body herhaald, regel 22) eist nu óók dat die kolom binnen
    de laatste 90 seconden is bijgewerkt, naast de bestaande
    `is_online`/weekschema/geen-actieve-boeking-voorwaarden — dekt zo elk
    scenario waarbij de app niet meer actief open is (uitgelogd, tab
    dicht, sessie verlopen), niet alleen de expliciete logout-knop.
  - **Heartbeat in `barber/layout.tsx`** (wrapt alle `barber/*`-routes,
    dus onafhankelijk van welk specifiek scherm open staat): bij mount
    éénmalig en daarna elke 20s (ruim onder de 90s-drempel)
    `updateBarberLastActive()` (nieuw in `queries.ts`) aanroepen zolang er
    een geldige sessie is — no-op op de nog-niet-ingelogde `barber/login`/
    `register`-schermen. Nieuwe kolom-grant `grant update
    (last_active_at) on barber_profiles to authenticated`.
  - **Extra, voor directe correctheid**: `barber/profiel`'s
    `handleLogout()` zet `is_online` nu ook meteen expliciet op `false`
    vóór `signOut()` — zonder dit zou een net-uitgelogde barber nog tot
    90 seconden lang online lijken (het venster waarin de heartbeat-
    staleness het nog niet zelf gecorrigeerd heeft).
  - **Bewust buiten scope**: de losse "Nu beschikbaar"/"Nu niet
    online"-labels op `klant/barbers` lezen `is_online` nog rechtstreeks
    (niet via deze functie) — puur een lijst-label, geen boekingsblokkade.
    Kan hetzelfde fixen als gewenst, nu niet meegenomen (niet gevraagd).
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. De bug zelf
    hard bevestigd vóór de fix: een verse testbarber met `is_online=true`
    en geen `last_active_at` gaf via een rechtstreekse RPC-aanroep nog
    steeds `true` terug (het oude, nog-niet-gepushte functiegedrag) —
    root cause dus aangetoond, niet geraden.
  - **Update — migratie 0037 gepusht en de RPC-logica zelf volledig
    bevestigd (2026-08-19)**: met een tweede verse testbarber alle vier de
    scenario's rechtstreeks tegen de live database getest:
    `is_online=true` + `last_active_at=null` → `false`; `last_active_at`
    5 minuten oud → `false`; `last_active_at=nu` → `true`;
    `is_online=false` + `last_active_at=nu` → `false`. Alle vier exact
    zoals bedoeld. **Niet gelukt deze sessie**: de heartbeat zelf
    daadwerkelijk zien vuren door als deze testbarber in te loggen via de
    browser-preview — dezelfde terugkerende klik/submit-flakiness van de
    testtool als eerdere sessies (form-submit via ref-klik, JS-`click()`,
    `requestSubmit()` én coördinaat-klik gaven alle vier geen navigatie,
    ondanks dat de velden zelf wel degelijk gevuld raakten). De
    onderliggende heartbeat-code is standaard, hetzelfde patroon als de
    al langer bewezen 5s-polling elders in dit project (bv.
    `barber/dashboard`), dus het risico wordt laag ingeschat — maar puur
    de RPC/database-laag is hier hard bevestigd, niet de daadwerkelijke
    klik-doorloop. Beide testaccounts opgeruimd.
- **Maandelijkse btw-factuur voor barber-servicekosten (2026-08-19).**
  Groomy rekent barbers al sinds Fase 6 15% servicekosten (verrekend bij
  de uitbetaling, `payments.platform_fee_cents`) — een B2B-dienst waar in
  Nederland een wettelijke factuurplicht voor geldt (art. 34c Wet OB), die
  tot nu toe nergens werd nagekomen. Uitgebreid afgestemd met de gebruiker
  (zie vraag/antwoord eerder deze sessie): de 15% fee is **inclusief 21%
  btw** (teruggerekend, niet erbovenop), Groomy's eigen btw-nummer is nog
  niet bekend (expliciete placeholder-tekst i.p.v. een verzonnen nummer),
  factuurnummering begint bij 1, en een barber zonder ingevuld adres wordt
  die maand overgeslagen i.p.v. een ongeldige factuur te krijgen.
  - **Nieuwe migratie `0038_barber_invoices.sql`**: `barber_profiles.
    address`-kolom (+ cumulatieve kolom-grant, zelfde patroon als
    `kvk_number`/`city` sinds 0003 en `last_active_at` sinds 0037) — nieuw
    invoerveld op `/barber/aanmelden`. Nieuwe tabel `barber_invoices`
    (één rij per barber per kalendermaand, `line_items jsonb` is een
    bevroren snapshot op generatiemoment — een factuur mag nooit met
    terugwerkende kracht veranderen ook al wijzigt de onderliggende
    `payments`-data later, `unique(barber_id, period_start, period_end)`
    voorkomt dubbele facturen bij een overlappende cron-run). Geen
    client-grant (zelfde patroon als `payments`/`barber_no_show_warnings`)
    — nieuwe `get_own_barber_invoices()` security-definer-functie (zelfde
    truc als `get_own_barber_profile()`, 0020) voor de barber-kant, admin
    leest via de service role. Twee nieuwe `notification_type`-waarden:
    `invoice_available`, `invoice_address_missing`.
  - **Nieuwe maandelijkse cron** (`cron.schedule('generate-barber-
    invoices-job', '0 3 1 * *', ...)`, zelfde `app_config`/`CRON_SECRET`-
    opzet als de andere crons) → nieuwe route `/api/cron/generate-barber-
    invoices`. De aggregatie/btw-rondrekening zit bewust in TypeScript,
    niet in een SQL-functie (zelfde afweging als waarom Stripe-refunds
    ook altijd in een Route Handler zitten). Periode = kalendermaand op
    basis van `payments.released_at` (aansluiten op de daadwerkelijke
    uitbetaling, niet op `completed_at`), `escrow_state = 'refunded'`
    telt niet mee (daar is nooit iets ingehouden). Btw-rondrekening:
    `fee_excl_btw = round(fee_incl_btw / 1.21)`, `btw = fee_incl_btw -
    fee_excl_btw`. Handmatig testbaar met een expliciete
    `{"periodStart":"...","periodEnd":"..."}`-body (de echte cron stuurt
    altijd een lege body, dan geldt automatisch de vorige kalendermaand).
  - **PDF on-demand, niet vooraf gegenereerd/opgeslagen**: nieuwe
    dependency `@react-pdf/renderer` (pure-JS, geen headless-browser-
    overhead — past bij Vercel serverless, React-19-compatibel). Nieuw
    `src/lib/invoice-pdf.tsx` (documentdefinitie) + nieuwe route `GET
    /api/barber/invoices/[id]/pdf` (barber-sessie via
    `get_own_barber_invoices()`, of admin via `requireAdmin()` — genereert
    altijd uit de bevroren `line_items`/totalen op de rij, nooit uit live
    `payments`, dus een eenmaal gedownloade factuur blijft voor altijd
    identiek). Nieuw, gedeeld `src/lib/company-info.ts` (Barbershop
    Noviomagus-gegevens, nu voor het eerst op een derde plek nodig naast
    privacybeleid/voorwaarden — ook de Resend-notificatiemail-footer
    hergebruikt 'm nu i.p.v. de tekst te dupliceren).
  - **Nieuwe schermen**: `/barber/facturen` (lijst + downloadlink, nieuwe
    "Facturen"-rij op `/barber/profiel`) en `/admin/facturen` (alle
    facturen, zichtbaar welke barbers wegens ontbrekend adres zijn
    overgeslagen — nieuw item in `AdminShell`'s navigatie).
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
    allemaal schoon (de build was met name relevant om te bevestigen dat
    `@react-pdf/renderer` — een nieuwe, ongebruikte dependency-categorie
    in dit project — goed bundelt in een Route Handler, geen Node-only-
    API's mist in de serverless-omgeving).
  - **Update — migratie 0038 gepusht en end-to-end bevestigd (2026-08-19)**:
    testbarber met 100 wegwerpboekingen (cyclisch over de 4 standaard-
    diensten, `payments.released_at` verspreid over juli 2026, rechtstreeks
    via de service role ingevoegd — zelfde `insert-forceert-status-
    requested-dus-eerst-invoegen-dan-updaten`-aanpak als bij eerdere
    testdata dit soort sessies). Cron handmatig aangeroepen met een
    expliciete periode-body: `INV-2026-0001` correct aangemaakt met alle
    100 regels, en de bedragen exact narekenbaar (€468,75 incl. btw =
    €387,40 excl. + €81,35 btw — 15%-fee per boeking vooraf berekend en
    vergeleken, klopte tot op de cent). PDF-route zelf kon niet via een
    ingelogde barbersessie in de browser-preview getest worden (dezelfde
    terugkerende klik-flakiness) — in plaats daarvan `renderInvoicePdfBuffer()`
    rechtstreeks getest via een tijdelijke CRON_SECRET-beveiligde debug-
    route (zelfde diagnostische techniek als bij de site-URL-bug, meteen
    weer verwijderd na gebruik): een geldige 4-pagina-PDF (100 regels
    paginabreken correct over meerdere pagina's). Bijvangst tijdens het
    testen: poort 3000 bleek een oude, kapotte dev-server-instance (proces
    3974, corrupte `.next`-map) te serveren i.p.v. de eigen sessie — poort
    3002 (de bash-achtergrondtaak van deze sessie) gebruikt voor de
    daadwerkelijke test. Alle testdata (100 bookings/payments, de factuur,
    beide testaccounts) nadien volledig opgeruimd via cascade-delete op de
    twee auth-users. `/admin/facturen` en `/barber/facturen` zelf
    (rendering) niet pixel-voor-pixel bevestigd — wel bevestigd dat
    `/admin/facturen` zonder sessie correct naar login redirect (geen 500).
  - **Update — testfactuur op de gebruiker's eigen testaccount + betere
    adminlijst (zelfde dag)**: op verzoek een tweede testfactuur (8
    boekingen, juli 2026) aangemaakt onder het al bestaande echte
    testaccount "Randy van Londen" (`barber_profiles.id
    54b38022-bc80-4047-9a2b-0fc6ffd9ec0f`) i.p.v. een wegwerpaccount, zodat
    de gebruiker 'm met zijn eigen inloggegevens direct in `/barber/
    facturen` kan bekijken — het adres stond nog leeg, ingevuld met een
    duidelijk als testdata gemarkeerde waarde. De klant-kant blijft wél
    een wegwerptestaccount (`bookings.customer_id` cascadet, dus
    opruimen later = alleen die klant weggooien, zonder Randy's eigen
    account te hoeven aanraken). De eerdere, losstaande "Demo Factuur
    Barber"-testaccount (incl. diens boekingen/betalingen/factuur) is in
    dezelfde beurt weer volledig opgeruimd.
  - **`/admin/facturen` herbouwd naar een filterbare lijst** (gevraagd):
    nieuwe client component `src/components/admin/InvoicesTable.tsx` —
    bewust client-side filteren (niet het bestaande server-side
    `searchParams`-patroon van `StatusFilter`/`UserSearch`) omdat hier
    drie filters (naam, factuurnummer, datumbereik) tegelijk en direct
    moeten reageren, en het aantal facturen naar verwachting bescheiden
    blijft. Elke rij is nu een `<a>` naar de PDF-route (heel de rij
    klikbaar/downloadbaar, niet meer alleen een los "Download"-linkje).
  - **Zijdelings gevonden tijdens het opruimen, niet aangepakt (buiten
    scope)**: 3 losse `bookings`-rijen met `barber_id = null` bleken al
    van vóór deze sessie te dateren (`service_name_snapshot`: "Knipbeurt
    vandaag/gisteren/eergisteren" — herkenbaar als testdata van de
    eerdere `dayLabel()`-fix, 2026-08-15). Niet van mij, niet aangeraakt.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon voor de
    nieuwe `InvoicesTable`. Cron opnieuw gedraaid voor juli 2026 — verwerkte
    beide barbers in één run (`"overgeslagen: factuur voor deze periode
    bestond al"` voor de intussen-opgeruimde demo-barber, `"factuur
    aangemaakt"` voor Randy van Londen) — bevestigt ook meteen dat de
    unique-constraint-gebaseerde idempotentie werkt.
  - **Update — downloadbare inkomsten-CSV voor barbers (zelfde dag)**: op
    verzoek, los van de formele btw-factuur (die dekt alleen wat Groomy
    van de barber inhoudt, niet wat de barber zelf heeft ontvangen).
    Nieuwe route `GET /api/barber/earnings/export` — hergebruikt de
    bestaande `getPaymentsForBarber()` (geen nieuwe query nodig), altijd
    de eigen sessie (`auth.uid()`), CSV met UTF-8-BOM (voor correcte
    weergave van "€"/accenten in Excel). Nieuwe knop op
    `/barber/verdiensten` naast de bestaande "Bekijk uitbetalingen".
    Bewust CSV i.p.v. PDF — dit is ruwe data bedoeld voor een spreadsheet/
    boekhoudpakket, geen formeel document zoals de factuur.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon.

## Lokale dev-server startte niet in de preview-tool (EPERM)

Symptoom: `preview_start` met de `groomy-dev`-launch-config crashte
telkens meteen bij opstarten met `EPERM: process.cwd failed with error
operation not permitted, uv_cwd` — een fout diep in npm's eigen
`Config`-klasse, vóórdat er ook maar iets van het project geladen wordt.
`npm run dev` rechtstreeks via Bash werkte intussen prima (bewijs dat het
project/npm zelf niet stuk was).

**Root cause**: er bestaan *twee* `.claude/launch.json`-bestanden — een in
de projectmap zelf (`groomy-mvp/groomy/.claude/launch.json`, degene die
in deze repo staat) én een tweede op het hoofdmapniveau
(`/Users/randy/Desktop/Projecten/.claude/launch.json`, buiten deze repo).
De preview-tool bleek de tweede te lezen (haar eigen sessie-cwd is de
hoofdmap, niet de projectmap), en die had een *relatief* `"cwd":
"groomy-mvp/groomy"`-veld. Dat relatieve pad liet npm's eigen
cwd-afhandeling (`process.wrappedCwd`) stuklopen op OS-niveau.

**Fix**: dat relatieve pad in de hoofdmap-`launch.json` vervangen door
een absoluut pad (`/Users/randy/Desktop/Projecten/groomy-mvp/groomy`).
Werkt sindsdien weer normaal. Dit bestand staat buiten de repo, dus deze
fix zit niet in git — puur ter documentatie hier voor een volgende sessie
die tegen dezelfde `EPERM` aanloopt: check eerst of er een tweede
`launch.json` op een hoger niveau bestaat vóórdat je tijd steekt in het
(zinloos) herschrijven van de projectmap-versie.

## Late annulering was overal "gratis" beloofd zonder dat iets dat afdwong (2026-08-17)

Gemeld: bij annuleren binnen het uur voor de afspraak stond er nog steeds
"geen kosten in rekening gebracht". Onderzocht: `"Annuleren kan gratis tot
1 uur vooraf"` stond op twee plekken (`klant/boeking`, `klant/annuleren`)
als statische tekst, maar nergens in de code werd ooit gekeken hoe dicht
de annulering op de afspraak zat — `/api/stripe/cancel-and-refund`
betaalde altijd 100% terug, ongeacht timing. De belofte was dus nooit
ergens afgedwongen.

**Met de gebruiker afgestemd**: een echte late-annuleringskosten bouwen
(i.p.v. alleen de tekst corrigeren) — 50% van het bedrag, de andere 50%
gaat als compensatie naar de barber. Voor een asap-boeking (geen vaste
`scheduled_at` om "1 uur vooraf" aan af te meten) geldt de fee zodra de
barber onderweg is (`status = 'en_route'` of verder), niet al bij
accepteren.

- **`src/lib/booking-timing.ts`**: nieuwe `cancellationFeeApplies()`,
  naast de bestaande `isRideDue()`. Waar zodra (a) de boeking al
  `en_route`/`arrived`/`in_progress` is (geldt voor zowel asap als
  gepland — de barber heeft dan sowieso al reistijd geïnvesteerd), of (b)
  het een geaccepteerde, geplande (niet-asap) boeking is binnen
  `CANCELLATION_FEE_WINDOW_MS` (1 uur) vóór `scheduled_at`. Een nog niet
  geaccepteerde boeking, of een net-geaccepteerde asap-boeking waar de
  barber nog niet vertrokken is, blijft altijd gratis annuleerbaar. Apart
  geverifieerd met 9 tijdstip/status-combinaties (`node -e`, zelfde
  aanpak als eerder bij `isRideDue`) — allemaal correct.
- **`/api/stripe/cancel-and-refund`**: fee geldt alleen als de **klant**
  annuleert (niet als de barber zelf annuleert — dat is niet de klant
  z'n schuld). Bij een toepasselijke fee: gedeeltelijke Stripe-refund
  (50%) + een directe Stripe Connect-transfer van 50% van
  `barber_payout_cents` naar de barber, `payments`-rij bijgewerkt
  (`amount_cents`/`platform_fee_cents`/`barber_payout_cents` herzien naar
  het ingehouden deel) — zelfde patroon (proportionele refund + directe
  transfer + payments-rij herschrijven) als het al bestaande gedeeltelijke-
  terugbetaling-pad in `/api/admin/disputes/resolve`. Als de barber nog
  geen werkende Stripe Connect-koppeling heeft kán het ingehouden deel
  nergens heen — dan blijft het gewoon een volledige, gratis annulering
  i.p.v. de klant te laten betalen voor iets dat de barber toch niet
  ontvangt. Een mislukte transfer (ná een geslaagde klant-refund) laat de
  annulering niet alsnog falen — die blijft geannuleerd — maar wordt via
  Sentry gelogd voor handmatige opvolging.
- **`klant/annuleren`**: haalt nu de boeking op (deed dat voorheen niet)
  en toont een dynamische waarschuwing i.p.v. de statische tekst — "nu
  nog gratis" of het exacte bedrag dat wordt ingehouden, afhankelijk van
  `cancellationFeeApplies()`.
- **`klant/boeking`**: de informatieve annuleerregel eronder is bijgewerkt
  zodat 'ie ook de asap/onderweg-uitzondering noemt, niet alleen "1 uur
  vooraf".
- **Bekende, bewust ongefixte edge case**: bij een boeking met een
  toegepaste kortingscode is `payments.barber_payout_cents` gebaseerd op
  de *onverdisconteerde* prijs (zie `payment-reconcile.ts`) — een fee op
  zo'n boeking zou in theorie een negatieve `platform_fee_cents` kunnen
  opleveren (DB-constraint zou de update dan laten falen, opgevangen via
  dezelfde Sentry-catch). Exact dezelfde bestaande blootstelling zit al in
  `/api/admin/disputes/resolve`'s partial-refund-pad — geen nieuwe
  regressie, wel iets om ooit gezamenlijk te harden.
- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon, plus de
  losstaande logica-check hierboven. Geen live Stripe-Connect-transfer
  end-to-end getest (vereist een écht gekoppelde testbarber-account, niet
  triviaal na te bootsen) — de route hergebruikt bewust exact hetzelfde,
  al eerder geschreven transfer-patroon als disputes/resolve.
- **Update (zelfde dag) — annuleringskosten-model verfijnd + een losse,
  ernstigere ontdekking over platformomzet.** Doorgevraagd door de
  gebruiker over waar het geld precies naartoe gaat bij een late
  annulering. Twee wijzigingen:
  1. **De servicekosten (15%) zijn nooit onderdeel van de 50%-korting** —
     die betaalt de klant sowieso altijd, annuleren of niet. Voorheen
     werd de 50% over het hele betaalde bedrag (incl. servicekosten)
     berekend; nu alleen over het dienstbedrag zelf (`amount_cents -
     platform_fee_cents`). De barber krijgt de helft daarvan, min de
     normale 15% servicekosten (`PLATFORM_FEE_RATE`, hergebruikt uit
     `src/lib/pricing.ts` i.p.v. het tarief te dupliceren) — dus exact
     hetzelfde tarief als altijd, alleen over een kleiner bedrag. Bij
     dienst €30 (klant betaalde €34,50): klant krijgt €15 terug, blijft
     €19,50 kwijt (€4,50 servicekosten + helft van €30), barber krijgt
     €12,75, platform houdt €6,75 — allemaal opnieuw doorgerekend en
     klopt (`priceValueCents`/`halfPriceCents`-aanpak in
     `/api/stripe/cancel-and-refund`, `klant/annuleren` toont nu ook het
     juiste bedrag).
  2. **Los daarvan, een echte ontdekking**: het gesprek over "waar gaat
     het geld heen" legde bloot dat `admin`'s "Platformomzet"-tegel al
     véél langer maar de helft van de werkelijke marge telde — niet
     specifiek voor annuleringen, voor élke boeking. `computePriceBreakdown()`
     trekt de 15% servicekosten *twee* keer af van de dienstprijs: één
     keer als opslag bovenop wat de klant betaalt (`totalCents`), én
     nogmaals als korting op wat de barber ontvangt
     (`barberPayoutCents`). Het platform houdt dus in werkelijkheid
     `amount_cents - barber_payout_cents` over (bij €30 dienst: €9,00),
     maar `getAdminStats()` telde alleen `platform_fee_cents` op (€4,50)
     — de barber-kant-helft van de marge werd nergens meegeteld, voor
     geen enkele boeking, al sinds Fase 10. **Op verzoek van de
     gebruiker gefixt**: `totalRevenueCents` in
     `src/lib/supabase/queries.ts` som nu `amount_cents -
     barber_payout_cents` per betaling, met een uitzondering voor
     `escrow_state = 'refunded'` (die tellen voor €0 mee — daar is
     feitelijk niets overgebleven, ook al blijven `amount_cents` e.d. op
     die rij bewust op het oorspronkelijke bedrag staan, voor de
     leesbaarheid van de betalingen-lijst in `admin/betalingen`). Dit
     verdubbelt het "Platformomzet"-cijfer op het admin-dashboard
     ongeveer (was voorheen structureel te laag) — geen boekingen zelf
     veranderd, puur hoe de bestaande data wordt opgeteld.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Beide
    rekenmodellen (annuleringskosten-split, omzet-som) los doorgerekend
    met een node-script (4 verschillende dienstprijzen voor de
    annuleringskosten, incl. een niet-rond bedrag €33,33 om
    afrondingsfouten te vangen; een 3-betalingen-mix — voltooid,
    geannuleerd-met-fee, volledig-refunded — voor de omzet-som) — beide
    kloppen exact.

## Beide partijen kregen geen melding van annuleringskosten (2026-08-17)

Gemeld: krijgt de klant/barber wel een melding van de daadwerkelijk in
rekening gebrachte annuleringskosten? Antwoord was nee op twee plekken:
- De bestaande `notify_customer_on_status_change()`-trigger (0017) stuurt
  bij annuleren altijd al een kale "Boeking geannuleerd"-melding naar de
  andere partij, maar die trigger vuurt als onderdeel van de
  `bookings`-UPDATE, dus *vóórdat* de annuleringskosten-berekening in de
  route überhaupt draait — die kan het bedrag dus nooit kennen. Geen optie
  om de trigger zelf uit te breiden; wel een tweede, aparte notification-
  insert nodig ná de berekening.
- `klant/geannuleerd` was volledig statisch en beweerde altijd "Er is nog
  geen betaling in rekening gebracht" — sinds annuleringskosten bestaan
  simpelweg onwaar zodra die daadwerkelijk werden geheven.
- **`/api/stripe/cancel-and-refund`**: bij een toegepaste fee nu twee
  losse `notifications`-inserts (niet ter vervanging van de generieke
  trigger-melding, als aanvulling erop): klant krijgt "Annuleringskosten
  in rekening gebracht" met het exacte terug-/ingehouden bedrag, barber
  krijgt "Compensatie voor late annulering" met het exacte
  uitbetaalde bedrag — pas ná een geslaagde Stripe-transfer, dus nooit
  een meldingsbelofte die niet ook echt is uitbetaald.
- **`klant/geannuleerd`**: leest nu `bookingId` en haalt de betaling op
  (`getPayment()`) — `escrow_state = 'released'` betekent hier
  ondubbelzinnig "annuleringskosten toegepast" (dat gebeurt anders alleen
  via de normale, hier onbereikbare completed-booking-escrow-cron), dus
  op basis daarvan het echte bedrag tonen i.p.v. de oude, nu soms onware
  vaste tekst.
- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon.
- **Update (zelfde dag)**: gebruiker vroeg door — gaat het terugbetaalde
  bedrag terug naar de bankrekening, en hoe lang duurt dat? Stripe stort
  een refund altijd terug op de oorspronkelijke betaalmethode (iDEAL ->
  bank, kaart -> kaart), nooit ergens anders heen, indicatie 5-10
  werkdagen. Nieuwe gedeelde `REFUND_TIMING_NOTE`-tekst (los gedefinieerd
  in zowel `cancel-and-refund/route.ts` als `klant/geannuleerd`, geen
  gedeelde module voor zo'n korte constante) toegevoegd aan:
  - de al bestaande annuleringskosten-notificatie aan de klant;
  - een **nieuwe** notificatie "Betaling terugbetaald" voor het pad
    zónder fee (volledige refund) — bestond nog niet, ongeacht wie
    annuleert (ook als de bárber annuleert krijgt de klant dit, want die
    krijgt hoe dan ook zijn geld terug en wil weten waarheen);
  - beide takken van `klant/geannuleerd` (met en zonder fee).
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon.
- **Barber-no-show-strike-systeem voor geplande afspraken (2026-08-17).**
  Gemeld: een barber die een geaccepteerde, vooruit-geplande afspraak niet
  binnen 60 minuten ná de afgesproken tijd bevestigt onderweg te zijn,
  moet de boeking automatisch laten vervallen — klant krijgt het volledige
  bedrag terug (incl. servicekosten, want dit is niet de klant z'n
  schuld), barber krijgt een waarschuwing, bij een 2e waarschuwing
  automatische schorsing. Admin moet dit kunnen terugzien met namen/data.
  - **Nieuwe migratie `0035_barber_no_show_expiry.sql`**: nieuwe tabel
    `barber_no_show_warnings` (één rij per waarschuwing — dubbelt als
    telling via rij-aantal i.p.v. een apart mutable-counter-veld, zelfde
    "ledger i.p.v. losse counter"-voorkeur als de wallet-architectuur uit
    Fase 9). `notify_customer_on_status_change()` uitgebreid: de
    bestaande null-`cancelled_by`-tak (voorheen alleen voor de
    onbeantwoorde-aanvraag-timeout uit 0019) kreeg een `old.status`-check
    zodat een no-show (old.status = 'accepted') niet per ongeluk de
    "niemand heeft binnen 30 minuten gereageerd"-tekst krijgt, en een
    nieuwe eigen tak voor de klant-kant excuses-en-refund-melding.
    `trigger_expire_noshow_bookings()` + `pg_cron`-job (elke 5 min, zelfde
    cadans als expire-stale-requests) — zelfde `net.http_post`-naar-Route-
    Handler-opzet als alle andere tijd-gebaseerde crons in dit project.
  - **Nieuwe route `/api/cron/expire-noshow-bookings`**: zelfde
    claim-dan-verwerken-patroon als `expire-stale-requests` (voorkomt
    dubbele verwerking bij overlappende cron-runs). Volledige refund
    (bewust géén annuleringskosten-logica — die geldt alleen bij een te
    late annulering dóór de klant). Barber-kant: eigen waarschuwing
    insert-en-tellen, bij 2 automatisch `barber_status = 'suspended'`
    zetten (dezelfde status als een handmatige admin-schorsing, dus
    meteen zichtbaar/effectief overal waar die status al gebruikt wordt)
    + notificatie; anders een "1e waarschuwing"-notificatie. De
    klant-kant-notificatie komt niet uit deze route maar uit de
    trigger hierboven (die vuurt al bij de status-update zelf).
  - **Nieuwe admin-pagina `/admin/no-shows`** ("Gemiste afspraken", toegevoegd
    aan `AdminShell`'s navigatie): leest `getNoShowWarningsForAdmin()`
    (nieuw in `queries.ts`) — barbernaam, klantnaam, dienst, geplande
    tijd, wanneer de waarschuwing viel, en het volgnummer (1e/2e) voor die
    barber, met een "Geschorst"-badge zodra dat volgnummer 2 bereikt.
    Puur read-only (geen acties nodig — het systeem handelt al automatisch
    af), dus dichter bij het simpele `admin/logboek`-patroon dan bij de
    actie-rijke `DisputesTable`.
  - **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon, plus de
    warning-telling-en-schorsingslogica los doorgeredeneerd (1e incident:
    telling 1, alleen waarschuwing; 2e incident: telling 2, schorsing +
    andere melding). **Nog te pushen door de gebruiker** — zie het
    migratie-commando hieronder in de sessie.
- **Annuleringsmeldingen noemden nooit de reden (2026-08-17).**
  Gemeld: klant/barber zagen bij een annulering alleen "Boeking
  geannuleerd", nooit de daadwerkelijke reden — die stond al op
  `bookings.cancelled_reason`, werd alleen nooit meegestuurd. Nieuwe
  migratie `0036_cancellation_reason_in_notification.sql`: de twee
  door-een-partij-geannuleerde takken van `notify_customer_on_status_
  change()` (klant->barber, barber->klant) noemen nu `coalesce(new.
  cancelled_reason, 'niet opgegeven')` in de melding. De systeem-timeout-
  takken (onbeantwoorde aanvraag, no-show) blijven ongewijzigd — daar is
  geen door-een-gebruiker-gekozen reden, de vaste tekst is al
  zelfverklarend. Bewust niet ook toegevoegd aan de losse geld-
  notificaties in `/api/stripe/cancel-and-refund` (annuleringskosten/
  terugbetaling) — die zijn al context-rijk genoeg met bedragen, de reden
  staat al in de eerdere, primaire "Boeking geannuleerd"-melding.
  **Terugkerende afspraak met de gebruiker**: dit soort dingen (een
  notificatie die evident onvolledige info toont terwijl de data er al
  is) voortaan zelf oppikken tijdens het bouwen, niet pas als de
  gebruiker het achteraf meldt.
  - **Geverifieerd**: geen TS geraakt (puur SQL), `npx tsc --noEmit`/
    `npm run lint` toch preventief gedraaid, schoon. **Nog te pushen door
    de gebruiker**, samen met 0035 hierboven.

## "Administratief"-kopje in het adminpanel — boekhouder-exports (2026-08-19)

De maandelijkse btw-facturen aan barbers (0038) dekken maar één deel van
wat de gebruiker voor zijn eigen boekhouding nodig heeft — die facturen
laten zien wat er bij barbers is *ingehouden*, niet wat Groomy als geheel
heeft *verdiend* of *uitgegeven*. Nieuw `/admin/administratief`: een
periodekiezer (van/tot + presets "Deze maand"/"Vorige maand"/"Dit jaar")
met vijf downloads:

- **Commissiefacturen** — alle `barber_invoices` waarvan `period_start`
  binnen de gekozen periode valt, gebundeld als PDF's in een ZIP
  (hergebruikt `renderInvoicePdfBuffer()` ongewijzigd).
- **Omzet-overzicht (CSV)** — regel per boeking, zelfde
  `amount_cents - barber_payout_cents`-logica als het bestaande
  `getAdminStats()`-dashboardcijfer, hier per rij i.p.v. alleen gesommeerd.
- **Kosten-overzicht (CSV)** — regel per `wallet_ledger_entries`-rij met
  `entry_type in ('topup_bonus', 'referral_bonus_referrer',
  'referral_bonus_referee')` — de enige "kosten" die het platform zelf
  in de eigen data heeft (wallet-/referral-bonussen). Externe kosten
  (Stripe-transactiekosten, hosting, abonnementen) staan nergens in de
  database en ontbreken dus bewust.
- **Samenvatting (CSV)** — aantal boekingen, bruto omzet, totale kosten,
  **bruto**resultaat, aantal facturen aan barbers, en de btw-som op die
  facturen (direct bruikbaar als "verschuldigde btw over servicekosten"
  voor de btw-aangifte). Expliciet **geen** "netto"-resultaat — dat zou
  een vals compleet beeld geven zolang externe kosten ontbreken.
- **Alles-in-één (ZIP)** — combineert alle vier in één download
  (`omzet.csv`, `kosten.csv`, `samenvatting.csv`, `facturen/`-submap).

**Nieuwe bestanden**: `src/lib/csv.ts` (gedeelde `toCsv()`-helper met
BOM/escaping, `/api/barber/earnings/export` hierop omgezet zodat de logica
niet dubbel bestaat), `src/lib/report-period.ts` (`from`/`to`-parsing,
zet de door de gebruiker als inclusief bedoelde "tot"-datum om naar een
halfopen bovengrens), `src/lib/admin-reports.ts` (CSV-opbouw + ZIP-opbouw,
gedeeld door alle vijf routes), vijf routes onder
`/api/admin/reports/{omzet,kosten,samenvatting,facturen,alles}` (allemaal
`requireAdmin()`-gated), `src/components/admin/AdministratiefPanel.tsx` +
nieuw gedeeld `src/components/admin/FilterField.tsx` (uit `InvoicesTable`
getild, geen gedrags-wijziging). Nieuwe dependency `jszip` (puur JS,
zonder eigen dependencies — bevestigd los van de bestaande, hier
ongerelateerde `npm audit`-waarschuwingen die al van vóór deze toevoeging
dateren).

Nieuwe query-helpers in `queries.ts`: `getRevenueReportRows()`,
`getCostReportRows()`, `getInvoicesForPeriod()` (volle facturen-rijen
incl. `line_items`/barberadres, voor zowel de facturen-ZIP als het
aantal/btw-totaal in de samenvatting — één query voor twee doelen i.p.v.
een bijna-identieke tweede). `AdminInvoiceRow` kreeg er een `btwCents`-veld
bij (niet-breaking, alleen gebruikt in de samenvatting).

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon (bevestigt dat `jszip` — net als eerder `@react-pdf/renderer` —
  goed bundelt in een Route Handler). Testdata: 30 boekingen/betalingen
  tussen twee nieuwe testaccounts (juni/juli volledig afgerekend, 1-18
  augustus nog lopend), cron voor juni+juli gedraaid → twee nieuwe
  facturen. Alle vijf rapportages via een tijdelijke
  CRON_SECRET-gated debug-route gecontroleerd: omzet/kosten/btw-totalen
  met de hand teruggerekend tegen de ruwe `payments`-rijen (juni
  `platform_fee_cents`-som 4200 == factuur-`feeInclBtwCents` 4200, idem
  juli 3300 == 3300; btw-terugrekening 4200/1,21≈3471 excl. + 729 btw
  klopt), ZIP geopend en PDF-inhoud gecontroleerd. Pagina zelf bekeken
  via een tijdelijk aangemaakt (en na gebruik weer verwijderd)
  admin-account: periodekiezer-presets en alle vijf downloadlinks
  reageren correct op periodewijzigingen. Debug-route na gebruik
  verwijderd.

## Klant-kant servicekosten misten een eigen btw-splitsing (2026-08-19)

Vervolg op de "Administratief"-sectie hierboven: de gebruiker vroeg om
uit te zoeken of de servicekosten die de klant betaalt (de andere helft
van de platformmarge, naast de al btw-gesplitste barber-commissie) ook
apart btw-plichtig is, en zo ja dit net zo te documenteren/uit te
splitsen.

**Onderzoek** (belastingdienst.nl): het algemene btw-tarief van 21% geldt
voor bemiddelingsdiensten — er is geen vrijstelling van toepassing op een
bemiddelingsdienst rond een knipbeurt. Voor B2C (platform → klant, een
consument) geldt géén factuurplicht, maar de btw is wél gewoon
verschuldigd, en wel op het moment van de dienst/ontvangst van de
betaling (niet pas bij een — hier toch niet verplichte — factuur). Omdat
Groomy via Stripe (separate-charges-and-transfers) het volledige bedrag
al bij het aangaan van de boeking int, valt dat moment samen met de
boekingsdatum. Conclusie: de klant-servicekosten zijn een tweede,
losstaande btw-plichtige omzetstroom naast de al gedekte
barber-commissie, en hoorden dus ook uitgesplitst te worden — dit was tot
nu toe nergens in de app berekend.

**Fix**:
- **`splitBtwInclusive()` + `BTW_RATE`** verhuisd naar `src/lib/pricing.ts`
  (was een lokale constante/inline berekening in
  `/api/cron/generate-barber-invoices`, nu gedeeld — die cron gebruikt
  hem nu ook, geen gedragswijziging daar).
- **`getRevenueReportRows()`** (`queries.ts`) selecteert nu ook
  `payments.platform_fee_cents` en berekent per boeking
  `customerFeeExclBtwCents`/`customerBtwCents`/`customerFeeInclBtwCents`
  — dezelfde 21%-terugrekening als de barber-kant, toegepast op hetzelfde
  bedrag (`platform_fee_cents` is voor beide kanten identiek, want beide
  zijn dezelfde 15%-berekening uit `computePriceBreakdown()`). Nul bij
  een refunded boeking, net als `revenueCents`.
- **`omzet.csv`** (`admin-reports.ts`) kreeg drie extra kolommen (klant-
  servicekosten excl./btw/incl.) per boeking.
- **`samenvatting.csv`** kreeg "Klant-servicekosten excl. btw",
  "Btw op klant-servicekosten" en "Totaal verschuldigde btw" (= klant-btw
  + barber-factuur-btw) naast de bestaande barber-regel.
- **Belangrijke afronding-consistentie-fix**: de total-regels in beide
  CSV's sommeren niet de per-boeking-afgeronde excl./btw-kolommen, maar
  sommeren eerst alle `customerFeeInclBtwCents` en splitsen dat totaal
  in één keer — exact dezelfde methode als de barber-facturen (0038: eerst
  optellen, dan één keer 21% terugrekenen). Eerst per rij afronden en dan
  optellen gaf een 1-cent-afwijking t.o.v. de barber-kant voor exact
  hetzelfde onderliggende bedrag — bewust vermeden, want dat zou er voor
  een boekhouder uitzien als een fout terwijl het alleen een
  afrondingsartefact was.
- Uitleg op het scherm zelf (`page.tsx`/`AdministratiefPanel.tsx`)
  bijgewerkt: twee btw-plichtige stromen, bewust apart gehouden (andere
  grondslag/periode-scope: klant-kant = alle boekingen in de periode,
  barber-kant = de daadwerkelijk gegenereerde facturen in die periode).

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. Tegen de juni-testdata (10 boekingen, testbarber): klant-kant
  en barber-kant totalen nu byte-voor-byte gelijk zoals verwacht (beide
  €34,71 excl. + €7,29 btw = €42,00 incl.), bruto omzet €84,00 = 2×
  €42,00, totaal verschuldigde btw €14,58 = 2×€7,29 — allemaal met de
  hand nagerekend via een tijdelijke debug-route (na gebruik verwijderd).

## Facturen-lijst: maandgroepering + zoeken-op-klik (2026-08-20)

Vervolg op de bulk-testdata hierboven: de gebruiker vroeg om `/admin/
facturen` te herbouwen tot een lijstweergave per maand met een aparte
downloadknop per factuur, en om de bestaande instant-filters te
vervangen door een expliciete "Zoeken"-knop — nu het aantal facturen
door de bulk-testdata (zie hieronder) flink gegroeid is, is dat
prettiger dan bij elke toetsaanslag opnieuw filteren.

**`InvoicesTable.tsx` herbouwd**:
- Twee losse filter-state-lagen: `draft` (wat je typt, reageert nergens
  op) en `applied` (wat daadwerkelijk filtert, alleen bijgewerkt door
  "Zoeken"-knop of Enter in een veld). "Herstel filters" reset beide
  meteen.
- Facturen gegroepeerd op maand (`period_start`), nieuwste maand eerst,
  binnen een maand alfabetisch op barbernaam. Groepskop toont het aantal
  ("Juli 2026 (22)").
- Elke rij heeft nu een losse, zichtbare "Download"-knop i.p.v. de hele
  rij als link — met de barbernaam/factuurlabel/bedrag ernaast, geen
  functiewijziging van de download zelf (blijft dezelfde `/api/barber/
  invoices/[id]/pdf`-route).

**Testdata om dit te kunnen testen**: de 20 barbers/200 klanten uit de
eerdere bulk-dataset kregen ook boekingen voor februari t/m juni 2026
(elk 400, zelfde patroon als de eerdere juli-batch), gevolgd door de
factuur-cron voor elk van die 5 maanden. Resultaat: 123 facturen over 6
maanden (20-22 per maand). Onderweg opnieuw dezelfde twee scriptfouten
als eerder voorkomen door het eerdere seed-script als basis te
hergebruiken in plaats van opnieuw te schrijven.

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Live
  bekeken via een tijdelijk aangemaakt (en na gebruik weer verwijderd)
  admin-account: alle 6 maandgroepen met de juiste aantallen (22/21/20/
  20/20/20 = 123), filteren op "Test Barber" reduceert correct tot alleen
  de 2 maanden waarin die barber facturen heeft (juni/juli) zónder dat
  typen alleen al filtert, "Herstel filters" zet de volledige lijst
  terug. Download-knoppen wijzen naar de al eerder geverifieerde
  PDF-route, niet opnieuw doorgeklikt.

## Administratief herbouwd: 4 rubrieken × maandlijst met inzien+download (2026-08-20)

Verduidelijking van het eerdere "lijstweergave"-verzoek: niet de
facturen-pagina (die stond hierboven al), maar `/admin/administratief`
zelf moest van "kies een periode, download 5 losse bestanden" naar een
lijstweergave: de 4 rapportagetypes (Omzet-overzicht, Kosten-overzicht,
Samenvatting, Commissiefacturen) elk apart klikbaar, gevolgd door een
maandenlijst per type met zowel "Bekijken" (inline inzien) als een
downloadknop per maand.

**Nieuwe query-helper**: `getAvailableReportMonths()` (`queries.ts`) —
twee lichte queries (vroegste/laatste boekingsdatum, niet alle rijen
ophalen) om de lijst maanden te bepalen, nieuwste eerst.

**`format=json` op de omzet/kosten/samenvatting-routes**: dezelfde drie
routes die al CSV teruggeven, geven nu ook de ruwe rijen als JSON terug
met `?format=json` — voor de inline "Bekijken"-voorvertoning zonder
nieuwe routes te hoeven bouwen. `buildSamenvattingCsv()` in
`admin-reports.ts` opgesplitst in een herbruikbare `buildSamenvattingRows()`
(de berekening) + een dunne CSV-wrapper, zodat de JSON-preview en de CSV
dezelfde berekening delen i.p.v. hem te dupliceren.

**`AdministratiefPanel.tsx` volledig herbouwd** als accordion: klik een
rubriek open → maandenlijst (uit `getAvailableReportMonths()`) → per
maand een "Bekijken"-toggle (haalt de JSON lazy op, cachet in state zodat
opnieuw uitklappen niet opnieuw fetcht) die een inline tabel toont
(scrollbare `max-h-80`-container, want omzet kan per maand 400+ rijen
hebben), plus een directe downloadlink per maand. Commissiefacturen
wijkt bewust af: "Bekijken" navigeert naar `/admin/facturen` i.p.v. een
eigen tabel te bouwen — die pagina toont exact dit al (per-factuur-
download, zoekfunctie), dus geen dubbele component. Onderaan blijft één
"Download alles"-knop die de volledige beschikbare periode (vroegste t/m
laatste maand) als ZIP aanbiedt.

**`/admin/facturen` ondersteunt nu `?from=`/`?to=`-query-params**
(nieuwe optionele `initialFrom`/`initialTo`-props op `InvoicesTable`) —
zo opent de "Bekijken"-link vanuit Administratief de facturenlijst al
vooraf gefilterd op die maand, i.p.v. de gebruiker het handmatig te laten
intypen.

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. Live doorgeklikt via een tijdelijk aangemaakt (en na gebruik
  weer verwijderd) admin-account: alle 4 rubrieken openen/sluiten, alle 7
  beschikbare maanden tonen (februari t/m augustus 2026 — augustus komt
  van de twee losstaande naamsgebonden testaccounts, niet de bulk-data),
  omzet/kosten/samenvatting-inline-tabellen laden echte data (juli:
  bruto omzet €3159,00, kosten €125,00, brutoresultaat €3034,00, 413
  boekingen — consistent met eerdere handmatige narekening), Bekijken bij
  Commissiefacturen navigeert naar `/admin/facturen?from=2026-07-01&
  to=2026-07-31` en die pagina toont dan inderdaad precies en alleen de
  22 juli-facturen. Download-alles-href beslaat correct de volledige
  beschikbare periode (2026-02-01 t/m 2026-08-31).

## Barber kon goedgekeurd worden zonder factuurgegevens (2026-08-20)

Vervolg op de facturatie-vragen: een barber kon tot nu toe gewoon
goedgekeurd worden (en dus geld verdienen) zonder adres, stad of
KvK-nummer — die velden stonden al op `/barber/aanmelden`, maar waren
nergens verplicht. Gevolg: de maandelijkse factuur-cron (0038) sloeg zo'n
barber structureel over (geen adres = geen factuur), zonder dat dat ooit
opviel totdat iemand de facturenlijst doorzocht.

**Server-side gate (de eigenlijke afdwinging)**: `/api/admin/barbers/
status/route.ts` weigert nu `status: "approved"` met een 400 en een
duidelijke Nederlandse foutmelding als `barber_profiles.address`,
`.city` of `.kvk_number` leeg is. Dit is dezelfde route die ook
`/admin/no-shows`'s "Herstel"-knop gebruikt om een geschorste barber
terug te zetten naar approved — geen aparte route nodig, en een eerder
al goedgekeurde (dus al complete) barber loopt hier nooit tegenaan.

**Twee lagen eromheen, geen van beide de bron van waarheid**:
- `BarbersTable.tsx` toont nu ook het adres per rij, en een rode
  "Mist nog: …"-regel + een disabled Goedkeuren-knop (met `title`-
  tooltip) zodra een van de drie velden ontbreekt — zodat de admin dit
  al ziet vóórdat hij klikt, niet pas na een mislukte poging.
- `/barber/aanmelden` blokkeert nu zelf al "Volgende" op de eerste stap
  totdat naam/KvK/stad/adres allemaal ingevuld zijn (`step0Valid`) — een
  barber komt dus nooit meer bij verificatie/diensten aan zonder deze
  gegevens al gezet te hebben. De helper-tekst onder het adresveld is
  aangescherpt ("Verplicht... zonder deze gegevens kun je niet
  goedgekeurd worden").

`AdminBarberRow`/`getBarbersForAdmin()` kregen er een `address`-veld bij
(niet-breaking toevoeging).

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. End-to-end getest met een verse testbarber zonder adres/stad/
  KvK: UI toont "Mist nog: adres, stad, KvK-nummer" en de Goedkeuren-knop
  is disabled; een rechtstreekse `fetch()` naar de route (UI omzeild)
  geeft 400 met de verwachte foutmelding — bevestigt dat de server-kant
  de echte muur is, niet alleen de knop. Na het aanvullen van de drie
  velden: knop wordt automatisch weer klikbaar, de POST geeft 200, en de
  barber verdwijnt correct uit de pending-wachtrij naar approved.

## Marketingpagina verhuisd naar een los project (2026-08-20)

Eerst gebouwd als `/landing`-route in deze app (zie het commit-log voor
de originele versie), maar de gebruiker wilde 'm expliciet los van de
huidige webapp — "deze 2 dingen staan los van elkaar". Een route binnen
dezelfde Next.js-app deelt namelijk nog steeds build/deployment/domein
met de live webapp, ook al raakt de pagina zelf functioneel niets aan
(geen Supabase/auth-afhankelijkheid).

**Nu een volledig apart project**: `/Users/randy/Desktop/Projecten/
groomy-landing`, eigen `package.json`/Next.js-installatie, eigen git-repo,
bedoeld voor een eigen Vercel-project/domein. Geen gedeelde code met
deze app behalve bewust gedupliceerde stukjes (dezelfde Tailwind-
kleurtokens voor visuele consistentie, dezelfde `COMPANY_INFO`-gegevens)
— zo kan een probleem aan de ene kant de andere nooit raken.

Structuur/dichtheid ontleend aan trimmr-app.com (vergelijkbare barber-
marketplace-app, ter referentie meegegeven), met Groomy's eigen features
en zonder de reels/portfolio-video-functie die Groomy niet heeft. Zie
`groomy-landing/README.md` voor de volledige toelichting, inclusief wat
er bewust nog placeholder/niet-functioneel is (illustratieve statistieken,
niet-klikbare store-badges, en de links naar voorwaarden/privacybeleid
die voorlopig nog naar déze app verwijzen omdat die pagina's alleen hier
bestaan).

- **Geverifieerd**: los `npx tsc --noEmit`/`npm run lint`/`npm run build`
  in `groomy-landing` schoon (bouwt statisch, 123 B). Visueel gecontroleerd
  op desktop en mobiel, draaiend op een eigen poort naast deze app —
  bevestigt dat het twee volledig losse processen/deployments zijn.

## Bestandsuploads testen zonder een echte file-picker

De browser-testtool heeft geen "upload file"-actie. Voor het testen van
`<input type="file">`-uploads: injecteer een `File` via `DataTransfer` en
dispatch een `change`-event — werkt omdat browsers `input.files =
dataTransfer.files` toestaan (bedoeld voor precies dit soort automatisering,
niet te verwarren met een poging een echte user-gesture te faken):
```js
const dt = new DataTransfer();
dt.items.add(new File([bytes], 'naam.png', { type: 'image/png' }));
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

## RLS/Storage verifiëren zonder service role key

Ik heb alleen de anon key (bewust — zie regel 7). Om te checken of een
tabel/bucket na een migratie echt bestaat, zonder ooit rijen te kunnen
lezen (RLS blokkeert anon overal):

- **Tabellen**: `GET {url}/rest/v1/{tabel}?select=*&limit=1` met de anon
  key. `PGRST205`/"relation not found" (404) = tabel bestaat niet.
  `42501`/"permission denied for table" (401) = tabel bestaat wél, RLS/
  grants werken zoals bedoeld (dit IS het gewenste resultaat, geen bug).
- **Storage-buckets**: `GET {url}/storage/v1/bucket/{naam}` met de anon
  key is **onbetrouwbaar** — geeft ook "Bucket not found" terug als de
  bucket wél bestaat maar anon geen rechten heeft op bucket-metadata.
  Gebruik in plaats daarvan de publieke object-URL: `GET {url}/storage/v1/
  object/public/{bucket}/niet-bestaand-bestand`. "Object not found" =
  bucket bestaat (het bestand niet, logisch); "Bucket not found" = de
  bucket zelf bestaat niet. Werkt alleen voor publieke buckets; voor een
  privé-bucket is dit niet te verifiëren zonder een ingelogde sessie.

## Openstaande beslissingen voor een volgende fase

- **Custom SMTP instellen in Supabase** (Authentication → Settings → SMTP
  Settings, bv. via Resend) — de gratis ingebouwde mailservice is niet
  geschikt voor productie en heeft een lage rate limit die al tijdens
  testen geraakt werd.
- Welke ORM bovenop het bestaande schema (Supabase/Postgres + eventueel
  Prisma) — nog niet gekozen.
- **Stripe Connect Express-onboarding nog nooit met een echt afgeronde
  KYC-flow getest** (zie "Fase 6 — architectuur" in PROJECT.md) — account-
  aanmaak en de Account Link-redirect zijn bevestigd, het gehoste
  formulier zelf kon niet geautomatiseerd doorlopen worden. Vóór een
  echte launch: eenmalig handmatig doorlopen om te bevestigen dat
  `stripe_payouts_enabled` na een echte afronding correct bijgewerkt
  wordt door de `account.updated`-webhook.
- Precieze per-boeking `paid`-tracking (Stripe's payout-batching maakt dit
  niet 1-op-1 herleidbaar, zie "Fase 6 — architectuur") — `escrow_state`
  bereikt in de huidige MVP maximaal `released`.
- **Mapbox/Google Geocoding & Maps** — Fase 5 gebruikt bewust de gratis
  Nominatim/OpenStreetMap-geocoding (zie "Fase 5 — architectuur" in
  PROJECT.md), met de gebruiker afgestemd: ga nu voor de gratis/key-loze
  optie, maar houd Mapbox/Google genoteerd als upgrade-pad voor als een
  latere fase (echte live kaart, hogere nauwkeurigheid/rate-limits nodig
  op productieschaal) daar alsnog voor kiest. Nog niet gekozen.
- Supabase-gegenereerde database-types (`Database`-generic) zijn nog niet
  opgezet — `.from(...)`-calls zijn functioneel maar niet volledig
  type-safe.
- OAuth (Apple/Google): knoppen staan al (verborgen) in de UI
  (`OAUTH_ENABLED = false` in beide login-pagina's), echte flow nog niet
  gebouwd.
