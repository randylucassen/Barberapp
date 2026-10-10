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
de projectmap zelf (`KPPRTJE-mvp/KPPRTJE/.claude/launch.json`, degene die
in deze repo staat) én een tweede op het hoofdmapniveau
(`/Users/randy/Desktop/Projecten/.claude/launch.json`, buiten deze repo).
De preview-tool bleek de tweede te lezen (haar eigen sessie-cwd is de
hoofdmap, niet de projectmap), en die had een *relatief* `"cwd":
"KPPRTJE-mvp/KPPRTJE"`-veld. Dat relatieve pad liet npm's eigen
cwd-afhandeling (`process.wrappedCwd`) stuklopen op OS-niveau.

**Fix**: dat relatieve pad in de hoofdmap-`launch.json` vervangen door
een absoluut pad (`/Users/randy/Desktop/Projecten/KPPRTJE-mvp/KPPRTJE`).
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

## Barber-portfolio: verzameld maar nergens getoond (2026-08-21)

Tijdens een gesprek over "hoe kan ik een portfolio voor barbers op een
logische manier aanmaken" bleek het portfolio-systeem al te bestaan,
maar functioneel dood te zijn: `/barber/aanmelden` liet een barber
minimaal 3 foto's uploaden (`barber_profiles.portfolio_urls`), maar die
data werd **nergens** aan een klant getoond (geen barber-detailscherm,
de klantenlijst toonde alleen naam/rating/prijs) én een barber kon zijn
portfolio na het aanmelden nooit meer bijwerken.

**Ontwerpkeuze, met de gebruiker afgestemd**: geen aparte "goedkeurings"-
stap na het kiezen (zou de "Nu"-flow onnodig vertragen zonder de klant
meer controle te geven) — portfolio bekijken hoort bij het kiesmoment
zelf. Geldt niet voor "Snelste beschikbare barber": daar staat de barber
nog niet vast op het moment van kiezen, dus is er inherent niets te
tonen (vergelijkbaar met Uber, waar je je chauffeur ook pas na het
matchen ziet).

**Migratie `0039_barber_portfolio_visible.sql`**: voegt `bp.
portfolio_urls` toe aan de `approved_barbers`-view (0005) — had `bio` al,
`portfolio_urls` nog niet. **Val getrapt tijdens het pushen**: een eerste
versie zette de nieuwe kolom tussen `avatar_url`/`bio` en `rating_avg`/
`rating_count` in, wat `create or replace view` afwijst (`cannot change
name of view column "rating_avg" to "portfolio_urls"` — Postgres matcht
bestaande viewkolommen op positie, niet op naam; een nieuwe kolom mag
alleen aan het eind). Fix: `portfolio_urls` helemaal achteraan de
select-lijst, verder ongewijzigd.

**Klant-kant** (`/klant/barbers`): tikken op een barber (of de
onderaan-gepinde snelkeuzeknop) opent nu een `BarberDetail`-tussenscherm
i.p.v. direct de boekingsflow — bio, portfolio-grid, volledige
reviewlijst (hergebruikt de bestaande `getReviewsForBarber()`-RPC), en
pas daar een "Boek"-knop. `BarberListItem`/`getApprovedBarbersWithServices()`
kregen er `bio`/`portfolioUrls` bij.

**Barber-kant**: nieuw scherm `/barber/portfolio` (link vanaf
`/barber/profiel`) om foto's toe te voegen/verwijderen ná de aanmelding —
zelfde bewerken-dan-expliciet-opslaan-patroon als `/barber/werkgebied`.
Geen nieuwe grant nodig: `portfolio_urls` stond al in de
update-kolomlijst van barber_profiles sinds 0003.

**Tijdens het uitzoeken ook gevonden en gefixt**: drie plekken zeiden nog
"wekelijkse uitbetaling" (`/barber/uitbetalingen`, `/barber/profiel`,
`/barber/aanmelden`) — zelfde "binnen 24u i.p.v. wekelijks"-fout als net
op de landingspagina gecorrigeerd, nu ook in de echte app zelf recht­gezet.

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. Live getest: barber-portfolio-scherm (upload → 200 OK, render
  bevestigd via een echte `next/image`-request, opslaan/verwijderen
  beide bevestigd rechtstreeks in de database) met een test-PNG, daarna
  opgeruimd. Klant-detailscherm getest met de gebruiker's eigen
  "Randy van Londen"-account: bio/lege-portfolio-state/3 echte reviews
  (relatieve tijd, sterren, tekst) renderen correct, "Terug" behoudt de
  lijst-state, "Boek"-knop navigeert met de juiste `barberId`/`lines`/
  `asap`-parameters naar `/klant/boeking`.

## Portfolio-foto's uitvergroten + UX-verfijning barberslijst (2026-08-21)

Vervolg op de portfolio-feature hierboven: foto's aanklikbaar/uitvergrotbaar
maken, een tip-tekstje tussen de "Snelste beschikbare barber"-kaart en de
lijst (alleen bij "Nu"), en de taballabel "Nu" → "Nu online".

**Val getrapt bij het uitvergroten**: de eerste versie gebruikte
`position: fixed inset-0` voor de lightbox-overlay — die bleek te worden
afgekapt door `PhoneShell`'s eigen box (`overflow-hidden` +
`rounded-[36px]` + box-shadow, zie `src/components/shared/PhoneShell.tsx`),
een bekende Chromium-eigenaardigheid waarbij zo'n afgeronde/overflow-
hidden container met een schaduw effectief een eigen clipping-context
voor `fixed`-kinderen kan vormen, ook zonder `transform`. Omdat de hele
app toch altijd binnen die phone-frame rendert, is `position: fixed`
hier sowieso de verkeerde keuze — fix: `position: absolute inset-0` op
de overlay, met `relative` op `BarberDetail`'s root-`div` (was al
`h-full`, dus dekt exact het hele scherm inclusief header/footer).

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. Live getest: foto aanklikken opent de overlay,
  `getBoundingClientRect()` bevestigd dat die exact de volledige
  phone-frame dekt (0,0 tot volledige breedte/hoogte, niet afgekapt),
  sluiten via zowel de X-knop als een klik op de achtergrond beide
  bevestigd. Tip-tekst en het hernoemde tablabel ("Nu online") visueel
  gecontroleerd.

## Adressuggesties openden zichzelf al bij het openen van de klant-app (2026-08-21)

`AddressAutocomplete` (gedeeld door `klant/home`, `klant/boeking`,
`klant/adres`) haalde suggesties op zodra zijn `value`-prop veranderde —
inclusief het moment waarop een van die drie schermen het veld vooraf
invulde met `customer_profiles.default_address`, meteen bij het laden
van het scherm. Gevolg: de suggestielijst klapte zichzelf al open vóór
de klant ook maar iets had getypt, en stond in de weg op het scherm. Het
vooraf ingevulde adres zelf was altijd al gewenst — alleen de
suggestielijst hoorde er niet vanzelf bij te horen.

**Fix**: nieuwe `userEditedRef` in `AddressAutocomplete.tsx`, alleen op
`true` gezet in de `onChange` van de daadwerkelijke `<input>` (dus
echte toetsaanslagen) — de suggestie-`useEffect` haalt nu niks op zolang
die nog `false` staat, ongeacht hoe vaak de `value`-prop van buitenaf
verandert. Raakt automatisch alle drie schermen tegelijk, want ze delen
hetzelfde component — geen aparte fix per scherm nodig.

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. Live getest op `/klant/home` met een ingelogde klant met een
  opgeslagen adres: veld toont het adres direct, geen suggestielijst in
  de DOM. Daarna handmatig een ander adres getypt — suggesties
  verschijnen dan gewoon (echte PDOK-resultaten opgehaald), dus de
  eigenlijke autocomplete-functie is niet kapotgemaakt.

## Barber-profielfoto (2026-08-21)

Bleek grotendeels al klaar te liggen zonder dat er ooit UI voor gebouwd
was: `barber_profiles.avatar_url` bestond al sinds 0004 (incl.
update-grant voor de barber zelf), zat al in `approved_barbers` (0005)
en in `BarberListItem`/`BarberProfile` — alleen `Avatar` (`components/
shared/Avatar.tsx`) rendert altijd initialen, nooit een echte foto, dus
niets gebruikte die kolom.

**`Avatar` kreeg een optionele `imageUrl`-prop** — indien gezet toont
'm een `next/image` in een afgeronde cirkel i.p.v. de initialen-cirkel;
zonder prop ongewijzigd gedrag (alle ~13 bestaande aanroepen in de app
blijven werken zoals ze deden).

**`/barber/profiel`**: de eigen avatar bovenaan is nu tikbaar (camera-
badge eronder rechts), opent de file-picker, uploadt naar de bestaande
`barber-media`-bucket via `uploadBarberFile()` (zelfde functie als het
portfolio-scherm), schrijft direct naar `barber_profiles.avatar_url`.

**Klant-kant**: `/klant/barbers` geeft `imageUrl={b.avatarUrl}`/
`{barber.avatarUrl}` door aan zowel de lijstrijen als `BarberDetail` —
de data stroomde daar al doorheen (`getApprovedBarbersWithServices`
selecteerde `avatar_url` al), er hoefde alleen een prop bij.

- **Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
  schoon. Live getest met een test-PNG: upload op `/barber/profiel` →
  bevestigd in de database, daarna als klant ingelogd en bevestigd dat
  dezelfde foto in de barberslijst verschijnt i.p.v. initialen. Test-
  bestand en `avatar_url` na afloop weer opgeruimd.

## API-routes ondersteunen nu ook Bearer-auth, voor de native app (2026-08-28)

De gebruiker is begonnen met `groomy-app` — een losse React Native/Expo-
rewrite van deze webapp, zie het plan in `groomy-app`'s eigen repo
(`/Users/randy/Desktop/Projecten/KPPRTJE-app`, met een eigen `CLAUDE.md`).
Die app deelt dezelfde Supabase-database als deze webapp, maar heeft geen
cookies (AsyncStorage-sessie i.p.v. `@supabase/ssr`'s cookie-gebaseerde
aanpak) — de bestaande, cookie-only server-routes accepteerden dus geen
enkele aanroep vanuit de native app, ook niet met een geldig, ingelogd
account.

**Nieuwe `getRequestUser(request, supabase)`** in `src/lib/supabase/
server.ts`: valt terug op een `Authorization: Bearer <token>`-header
zodra er geen cookiesessie is. Belangrijke valkuil die dit opleverde:
`auth.getUser(jwt)` alleen identificeert wíe de aanroeper is, maar maakt
de meegegeven (cookie-based) client daarna nog niet vanzelf bearer-
geauthenticeerd voor `.from()`/`.rpc()`-calls — RLS zou dan alsnog als
`anon` evalueren. Fix: het bearer-pad geeft een aparte, kortstondige
client terug die de token als globale Authorization-header meestuurt op
élke request, zodat RLS `auth.uid()` correct evalueert. Cookie-pad
(de webapp zelf) is volledig ongewijzigd — dit is een aanvullend pad,
geen vervanging (zie regel 6 hierboven — dit voegt geen tweede
route-protectiemechanisme toe, `getRequestUser()` is puur *wie ben je*,
niet *mag je hier komen*, dat blijft per-route-logica zoals altijd).

**Toegepast op**: `/api/stripe/create-payment-intent`,
`/api/stripe/confirm-payment` — de twee routes die `groomy-app`'s eerste
werkende scherm (klant login → browse → boeken → betalen) nodig had. De
overige ~28 `/api/*`-routes zijn **niet** aangepast — dat gebeurt pas
zodra een volgende native-app-fase ze daadwerkelijk nodig heeft, niet nu
alvast preventief (zelfde "dunne verticale slice eerst"-aanpak als de
rest van het native-conversieplan).

**Geverifieerd tegen productie** (niet alleen `npx tsc --noEmit`/`npm run
lint`, die waren ook schoon): cookie-pad zonder `Authorization`-header
gaf nog steeds `401 "Niet ingelogd"` (ongewijzigd gedrag); bearer-pad met
een verzonnen boeking-ID gaf `404` (niet 401 — bevestigt dat de gebruiker
wél herkend werd); bearer-pad met een boeking die de testklant
(`test1234@test.nl`) zelf net had aangemaakt via diezelfde bearer-sessie
gaf een echte Stripe-`clientSecret` terug — dit laatste bewijst dat RLS
daadwerkelijk als de juiste gebruiker leest, niet stilzwijgend als anon
(dat zou de eerdere, onvolledige versie van deze fix niet gevangen
hebben). Testboeking nadien geannuleerd via dezelfde bearer-sessie, geen
testdata achtergelaten. Gepusht naar `main` (commit `b013050`).

## Vooruit geplande boekingen betalen nu pas ná acceptatie (2026-09-28)

Ontstaan tijdens het testen van de nieuwe native (`groomy-app`)
boekingsflow — de gebruiker vond het raar dat een klant meteen moet
betalen voor een vooruit geplande afspraak, terwijl nog niet vaststaat of
de (bij broadcast: een matchende) barber die afspraak wel kan/wil
accepteren. Met de gebruiker afgestemd: **alleen voor geplande
(`requested_asap = false`) boekingen** verschuift het betaalmoment naar
ná acceptatie, met een **24-uurs betaalvenster** (anders vervalt de
afspraak automatisch, kosteloos) — en een **nieuwe minimum-lead-time van
24 uur** voor het aanvragen zelf (moet toch al passen vóór het
betaalvenster). Asap-boekingen blijven volledig ongewijzigd: daar betaalt
de klant nog steeds meteen, vóórdat de barber de aanvraag ziet — bij "nu"
staat de barber op het punt te vertrekken, dus moet het geld al vaststaan
vóór hij dat doet, precies de omgekeerde tijdsdruk.

**Migratie `0040_deferred_payment_for_scheduled_bookings.sql`**:
- Nieuwe kolom `bookings.payment_due_at` (alleen server-side gezet, geen
  kolom-grant nodig — zelfde patroon als `completed_at` in dezelfde
  trigger, zie CLAUDE.md-regel 20).
- `create_booking_with_services()` (volledige body opnieuw, regel 22):
  nieuwe check die een geplande boeking weigert als `p_scheduled_at` niet
  minstens 24 uur in de toekomst ligt, vóór de al bestaande "bekende
  barber"-check (0029).
- `check_booking_status_transition()` (volledige body opnieuw): zet bij
  een requested->accepted-overgang van een geplande boeking zonder
  bestaande betaling (`not booking_has_payment()`) `payment_due_at = now()
  + 24u`. Dit is een `before update`-trigger, dus dezelfde truc als
  `completed_at` — de client hoeft deze kolom nooit zelf te kunnen zetten.
- `notify_customer_on_status_change()` (volledige body opnieuw): "Aanvraag
  bevestigd" krijgt bij een net-gezette `payment_due_at` een aangepaste
  tekst die naar het betaalvenster verwijst; nieuwe klant-tak voor een
  verlopen betaalvenster, gedisambigueerd van de bestaande no-show-tak
  (beide zijn `cancelled_by is null and old.status = 'accepted'`) via
  `old.payment_due_at is not null` — chronologisch overlappen deze twee
  sowieso nooit (een betaalvenster loopt af ruim vóór de no-show-check
  60 minuten ná de afspraaktijd zou kunnen vuren).
- **RLS-relaxatie, de kern van deze migratie**: de vier barber-
  zichtbaarheidspolicies op `bookings` (`booking_has_payment()`-gated
  sinds 0010/0021/0027) krijgen er een `or not bookings.requested_asap`
  bij — een barber (toegewezen óf matchend binnen straal/broadcast) mag
  een geplande boeking nu ook zónder betaling zien/claimen/accepteren.
  Voor asap-boekingen verandert er niets: `booking_has_payment()` blijft
  daar de enige poort.
- **Nieuwe cron** (`expire-unpaid-scheduled-bookings-job`, elke 5 min,
  zelfde `app_config`/`CRON_SECRET`-opzet als de andere tijd-gebaseerde
  crons) → nieuwe route `/api/cron/expire-unpaid-scheduled-bookings`:
  claimt (atomisch, zelfde patroon als expire-noshow-bookings) elke
  `accepted`-boeking met een verstreken `payment_due_at` en nog geen
  `payments`-rij, annuleert 'm (`cancelled_by = null`), stuurt de barber
  een directe notificatie (niet via de trigger — zelfde reden als de
  no-show-route: deze route weet zelf de context). **Geen refund-stap**
  nodig, er is nooit iets afgeschreven.

**Webapp-kant**:
- `klant/boeking`: `handleConfirm()` navigeert bij een asap-boeking nog
  steeds naar `/klant/betaling`, bij een geplande boeking nu naar
  `/klant/status` (geen betaalstap meer meteen). Nieuwe `minPlannedDate`
  (24u vooruit) als `min`-attribuut op het datumveld — puur een
  vriendelijke UI-guard (geen tijd-component), de echte grens wordt
  server-side afgedwongen met een duidelijke foutmelding via
  `bookingError` als iemand 'm toch omzeilt.
- `klant/status`: nieuwe `paymentPending`-afleiding (`status === 'accepted'
  && paymentDueAt`) met voorrang op de bestaande "afspraak bevestigd,
  nog niet due"-weergave — eigen titel/subtekst (incl. resterende uren,
  `Date.now()` hier zonder bezwaar want deze webapp heeft geen React
  Compiler, i.t.t. de native app), een prominente "Betaal nu"-knop naar
  `/klant/betaling`, en de live kaart blijft verborgen zolang er nog niet
  betaald is (zou anders een voortgang suggereren die er nog niet is).
- `barber/dashboard`'s "Geplande afspraken"-kaarten en `barber/afspraak`
  tonen nu een duidelijke "Wacht op betaling"-badge/melding zodra
  `payment_due_at` gezet is — zonder dit leek elke geplande afspraak daar
  even definitief, terwijl een onbetaalde er zo weer af kan vallen.
- `BOOKING_COLUMNS`/`mapBooking()`/`BookingRecord` (queries.ts/types.ts)
  selecteren/mappen nu overal `payment_due_at` — raakt dus **elk**
  boekingsscherm in deze webapp, niet alleen de nieuwe stukken (zelfde
  breed-rakende-kernquery-afhankelijkheid als destijds bij de
  live-locatiekaart, zie de 0033-aantekening hierboven).

**Native-app-kant** (`groomy-app`, aparte repo) tegelijk bijgewerkt om
consistent te blijven — zie dat project se eigen `CLAUDE.md` voor de
volledige toelichting: `boek-auto.tsx`/`barber/[id].tsx` navigeren bij een
geplande boeking nu naar het boekingsstatus-scherm i.p.v. rechtstreeks
naar betalen; `booking/[id].tsx` kreeg dezelfde "Betaal nu"-knop +
resterende-uren-weergave; `ScheduleField.tsx`'s datumkiezer staat nu op
een minimum van 24u vooruit (was: nu).

**Nog niet end-to-end geverifieerd** — deze migratie stond bij het
schrijven van deze aantekening nog niet gepusht (zie CLAUDE.md-regel 11:
`db push` is aan de gebruiker). `npx tsc --noEmit`/`npm run lint` in
zowel deze webapp als `groomy-app` zijn wel schoon. **Belangrijk, zelfde
volgorde-waarschuwing als bij 0033**: deze migratie moet gepusht zijn
vóórdat de webapp-code hierboven naar `main`/Vercel gaat — anders faalt
elke boekings-fetch in productie op een ontbrekende kolom. De
webapp-wijzigingen staan bij het schrijven van deze aantekening dan ook
nog niet gecommit/gepusht, bewust in die volgorde.

## Rebrand naar KPPRTJE! (2026-09-28)

De handelsnaam-onzekerheid uit "Openstaande beslissingen" is opgelost —
de gebruiker liet via Claude Design een echt logo/woordmerk maken en gaf
een kant-en-klare bestandenmap (`~/Desktop/Projecten/KPPRTJE-brand/`,
inclusief een `README.md` met exacte doelpaden per project) die de
mapstructuur van alle drie projecten spiegelt. Merk: **naam altijd
"KPPRTJE!"** (met uitroepteken — dus ook mid-zin, bv. "Welkom terug bij
KPPRTJE!"). Woordmerk: Archivo 900 cursief, al omgezet naar vectorpaden
(geen fontdependency nodig). Kleuren ongewijzigd: teal `#0EA5A4`, zwart
`#111111`.

- **`src/app/icon.tsx` verwijderd** (was de placeholder-"G", zie de
  eerdere "functionele placeholder tot er een echt logo is"-comment) —
  vervangen door een los `src/app/icon.png` (512×512) + nieuw
  `src/app/apple-icon.png` (180×180), beide via Next.js' eigen
  bestandsconventie (geen route-registratie nodig).
- **Nieuwe `public/og-image.png`** (1200×630) — `layout.tsx`'s
  `metadata.openGraph`/`twitter` kregen er `images: ["/og-image.png"]`
  bij (bestond nog niet); `twitter.card` van `"summary"` naar
  `"summary_large_image"` (nu er een echte brede preview-afbeelding is).
- **`const title = "Groomy"` → `"KPPRTJE!"`** in `layout.tsx` — enige
  bron voor de paginatitel/OG-titel, dus overal in één keer bijgewerkt.
- **Alle overige tekstverwijzingen** naar "Groomy" (39 stuks over ~20
  bestanden — screentitels, `merchantDisplayName`, voorwaarden/
  privacybeleid-lopende-tekst, admin-schermen, de Resend-e-mailtemplate,
  `company-info.ts`'s `name`-veld) vervangen door "KPPRTJE!". **Bewust
  ongewijzigd**: `company-info.ts`'s `legalName: "Barbershop Noviomagus"`
  (de KvK-geregistreerde entiteit, los van het consumentenmerk) en de
  "handelsnaam ligt nog niet definitief vast"-comments boven voorwaarden/
  privacybeleid (nog steeds waar: het merk is gekozen, de KvK-
  handelsnaamregistratie zelf is een aparte, nog te zetten stap).
- **`src/app/api/geocode/route.ts`'s User-Agent-string** (`Groomy-MVP/1.0`,
  gestuurd naar Nominatim, niet klant-zichtbaar) ook meegenomen voor
  consistentie.
- Eén tekstuele correctie tijdens het vervangen: "Welkom terug bij
  Groomy." (met punt) werd bewust "Welkom terug bij KPPRTJE!" zonder punt
  — een uitroepteken-merknaam gevolgd door nog een punt las dubbelop.

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint`/`npm run build`
schoon (de build bevestigt met name dat de nieuwe icon/apple-icon/
og-image-routes goed oppikken — geen missende/verkeerd-geformatteerde
afbeeldingen). Browser-bevestigd: paginatitel + favicon-tab tonen
"KPPRTJE!", `/klant/login` toont "Welkom terug bij KPPRTJE!" correct
zonder dubbele punctuatie, geen nieuwe console-fouten.

**Bewust niet meegenomen** (stond ook expliciet zo in de README van de
merkbestanden-map, dezelfde voorzichtigheid hier aangehouden): niets aan
Apple/Stripe-gekoppelde identifiers gewijzigd. Zie de aparte aantekening
in `groomy-app`'s eigen `CLAUDE.md` voor de volledige toelichting waarom.

**Nog niet gepusht naar `main`/Vercel** bij het schrijven van deze
aantekening — een merk-rebrand op een live, geïndexeerde productiesite
is in mijn ogen een expliciete-bevestiging-eerst-actie (zichtbaar voor
echte bezoekers, niet zomaar terug te draaien qua eerste indruk/SEO-
snapshot), dus wacht ik op een go van de gebruiker vóór de push, ook al
is de commit zelf al klaar.

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

## `/api/stripe/cancel-and-refund` ondersteunt nu ook Bearer-auth (2026-10-01)

Zelfde patroon als `create-payment-intent`/`confirm-payment` (zie
"API-routes ondersteunen nu ook Bearer-auth" hierboven) — de native app
(`KPPRTJE-app`) kreeg een eigen boekingsstatus-scherm met een werkende
"Annuleer aanvraag"-flow, die deze route nodig had. `getRequestUser()`
i.p.v. `supabase.auth.getUser()` direct; de rest van de route
ongewijzigd (zowel de statusovergang als de refund-logica lopen nog
steeds via de gebruikerssessie, niet de service role — regel 15 blijft
van toepassing). Cookie-pad (de webapp zelf) ongewijzigd.

**Geverifieerd**: `npx tsc --noEmit` schoon. End-to-end getest vanuit de
native app se webpreview tegen een echte `en_route`-testboeking (zonder
`payments`-rij) — de annuleer-aanvraag-call zelf werd geblokkeerd door
een bekende CORS-beperking van die specifieke testomgeving (browser-
preview praat cross-origin met de productie-API, zie de bestaande
CORS-aantekening bij Fase 5/geocode hierboven) — niet een probleem met
de route zelf, native `fetch` op een echt toestel kent deze restrictie
niet. Wel bevestigd: de kostenberekening klopt exact (€35 dienst → €40,25
betaald, €17,50 refund, €22,75 compensatie, allemaal narekenbaar), en de
UI handelt een mislukte fetch nu netjes af i.p.v. voor altijd op "Bezig…"
te blijven hangen (zie de aparte aantekening in `KPPRTJE-app`'s eigen
CLAUDE.md).

## Prijs per dienst nu vrij, met een algemeen minimum van €25 (2026-10-03)

Ontstaan vanuit een batch van zes verzoeken aan de native barber-kant
(`KPPRTJE-app`, zie diens eigen CLAUDE.md "Zes losse fixes vóór de
volgende build" voor de volledige lijst) — hier alleen het stuk dat deze
webapp-repo raakt. Barbers mochten tot nu toe geen eigen prijzen
instellen (vaste catalogusprijzen); de gebruiker wilde dit vrijgeven,
met een ondergrens tegen een race-naar-de-bodem. Afgestemd met de
gebruiker: **€25 minimum per actieve dienst**.

- **Nieuwe migratie `supabase/migrations/0041_minimum_service_price.sql`**
  (**nog niet gepusht**): eerst een backfill (`update services set
  price_cents = 2500 where active = true and price_cents < 2500` —
  productiedata bevatte al meerdere actieve diensten onder €25, vooral
  "Baard trimmen"/"Kids"/"Kinderknipbeurt" uit de oude standaardcatalogus,
  bevestigd via een directe productiequery vóór het schrijven van de
  migratie), daarna een **conditionele** check-constraint
  (`not active or price_cents >= 2500` — niet een kale check op de
  kolom, zodat historische/inactieve rijen met een oudere, lagere prijs
  de migratie niet laten falen of herschreven hoeven te worden).
- **`src/lib/pricing.ts`**: nieuwe `MIN_SERVICE_PRICE_CENTS = 2500`-
  constante — UI-validatie, moet in sync blijven met de
  migratie-constraint. Zelfde constante 1-op-1 gekopieerd naar
  `KPPRTJE-app/src/lib/pricing.ts` (geen gedeeld package tussen de twee
  repo's, zie dat project se eigen CLAUDE.md).
- **`barber/aanmelden/page.tsx`**: Diensten-stap kreeg per-dienst-
  validatie (rode rand + "min. €{bedrag}"-hint onder het minimum) en de
  submitknop is disabled zolang niet elke dienst voldoet. Dit was de
  bestaande "verwijder alle diensten, voeg opnieuw in"-reset-aanmeldflow
  (zie de regel daarover elders in dit bestand) — de constraint hierboven
  is dus het laatste vangnet tegen een kapotte/omzeilde client, niet de
  voornaamste validatie.

**Belangrijke volgorde-afhankelijkheid, zelfde patroon als migratie
0040**: zonder migratie 0041 gepusht dwingt de server het nieuwe minimum
niet af — alleen de UI-validatie beschermt dan. Niet naar `main`/Vercel
pushen vóór de gebruiker bevestigt dat de migratie live staat.

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. De native-
kant van deze wijziging (identieke Diensten-stap-redesign, inclusief een
live test tegen een echt, al-goedgekeurd testaccount met een bestaande
€15-dienst die meteen correct als onder-het-minimum werd geflagd) staat
in `KPPRTJE-app`'s eigen CLAUDE.md. Deze webapp-kant (`barber/aanmelden/
page.tsx`) is **niet** opnieuw live doorlopen in deze sessie — de
onderliggende validatielogica is identiek aan de al-geverifieerde native
versie, en de migratie zelf staat nog niet gepusht.

**Update (2026-10-04) — migratie 0041 live, en een echt gevonden gat
gedicht**: de gebruiker bevestigde dat de migratie live staat; direct
daarna bleek een barber nergens anders prijzen kon wijzigen dan via de
hele aanmeld-wizard opnieuw (de "Diensten en prijzen"-rij op
`barber/profiel/page.tsx` had nooit een `onClick` gehad — puur
informatief, matcht hoe die rij al die tijd al was). Nieuw scherm
**`src/app/barber/diensten/page.tsx`**: een echt, los bewerkscherm, met
een **gerichte diff** i.p.v. de destructieve delete-all-reinsert-reset
die `aanmelden` gebruikt — bestaande rijen (met een `id`) worden
ge-update, nieuwe rijen ingevoegd, verwijderde rijen pas bij "Opslaan"
daadwerkelijk verwijderd. Veilig ook met bestaande boekingsgeschiedenis:
`bookings`/`booking_services` snapshotten naam/prijs/duur al bij het
boeken (`price_cents_snapshot` e.d.) en `services.id` staat overal op
`on delete set null` (0003/0027) — een service verwijderen raakt nooit
een oude boeking. Hergebruikt dezelfde `MIN_SERVICE_PRICE_CENTS`-
validatie (rode rand + "min. €{bedrag}"-hint, disabled "Opslaan"-knop)
als `aanmelden`'s Diensten-stap. `barber/profiel/page.tsx`'s rij kreeg
een `onClick` naar dit nieuwe scherm. Zelfde scherm 1-op-1 ook native
gebouwd — zie `KPPRTJE-app`'s eigen CLAUDE.md.

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Live tegen
productie bevestigd met `test12345@test.nl` (een echte, al-goedgekeurde
barber met 4 bestaande diensten, incl. een service — "Kinderknipbeurt" —
die dankzij de inmiddels live migratie 0041 al automatisch van €15 naar
€25 was opgehoogd): het scherm laadt alle 4 bestaande diensten correct,
een prijs onder €25 toont meteen de rode rand + "min. €25,00"-hint en
disabled de Opslaan-knop, de waarde terugzetten naar €25 maakt de knop
weer actief. Niet daadwerkelijk opgeslagen tijdens deze testronde (geen
reden om de live diensten van een bestaand testaccount te overschrijven
voor een verificatieronde) — add/remove-rij-interacties wel apart
bevestigd op de native kant (zie daar).

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

## "Dienst toevoegen" verwijderd uit het nieuwe diensten-editorscherm (2026-10-04)

Vervolg op gisteren se `barber/diensten/page.tsx` (zie hierboven): de
gebruiker wil geen "nieuwe dienst aanmaken"-pad op dit scherm — nieuwe
diensten blijven alleen via de aanmeld-wizard aan te maken, dit scherm
is nu uitsluitend voor bestaande diensten bewerken/verwijderen. De
"+ Dienst toevoegen"-knop, `addRow()` en de `Plus`-import zijn
verwijderd. `emptyRow()` blijft bestaan — nog steeds nodig als fallback
wanneer een barber nul bestaande diensten heeft bij het laden — en de
verwijderknop blijft gated op `rows.length > 1`, dus een barber kan nooit
via dit scherm op nul diensten uitkomen.

Tegelijk is ook het (los overwogen, "symboollogo") nieuwe "K!"-icoon
gebouwd — zwarte achtergrond, witte K, teal uitroepteken, de K- en
!-vectorpaden 1-op-1 overgenomen uit het bestaande woordmerk-app-icoon
(`KPPRTJE-brand/logo/svg/app-icon.svg`, letter voor letter opgebouwd uit
losse paden) om pixelidentieke typografie te garanderen. Nieuw
`KPPRTJE-landing/src/components/KSymbol.tsx` verving de
Scissors-icoon-in-een-zwarte-tegel in de landingpagina-header
(`src/app/page.tsx`); het inhoudelijke `Scissors`-icoon bij het
"Voor barbers"-kopje is bewust ongemoeid gelaten (geen logo-instantie).
Zelfde component ook native gebouwd — zie `KPPRTJE-app`'s eigen
CLAUDE.md voor de volledige toelichting (inclusief de klant-onboarding-
toepassing, die hier in de webapp-repo niet van toepassing is).

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint` (beide repo's) schoon.
Live bevestigd via de webpreview met `test12345@test.nl`: de
diensten-editor toont de 4 echte bestaande diensten zonder een
"Dienst toevoegen"-knop/rij (bevestigd via `get_page_text`, geen
tekstmatch meer). Landingpagina-header toont het nieuwe K!-icoon correct.

## "Vandaag verdiend" baseerde zich op het verkeerde tijdstempel (2026-10-04)

Gemeld vanuit de native app (barber-dashboard toonde €0,00 ondanks een
vandaag afgeronde boeking) — bleek **geen native-only bug**, zat al in
deze webapp-repo en is hier dus ook gefixt (native spiegelt deze query
1-op-1 inline, geen gedeelde queries.ts daar). Root cause:
`getPaymentsForBarber()` (`src/lib/supabase/queries.ts`) selecteerde
alleen `bookings.created_at` (wanneer de boeking is *aangevraagd*) —
`barber/dashboard/page.tsx`'s "Vandaag"-tegel en
`barber/verdiensten/page.tsx`'s week-balkjes/totaal/Recent-lijst
filterden/groepeerden daar allemaal op. Bij een geplande boeking die
dagen vóór de afspraak is aangevraagd, valt `created_at` niet op de dag
waarop 'm daadwerkelijk wordt afgerond, dus de boeking telde nooit mee
bij "Vandaag" — ook al werd het geld die dag pas echt verdiend.

**Fix**: `completed_at` toegevoegd aan `BarberPaymentRow`/de
onderliggende select, en elke "verdiend"/dag-berekening gebruikt nu
`completedAt` i.p.v. `createdAt` — inclusief een nieuwe eis dat
`completedAt` niet-null moet zijn (een betaling kan al in escrow staan
terwijl de knipbeurt nog bezig is; die telt nu terecht pas mee als
"verdiend" zodra de boeking echt is afgerond, niet eerder). **Bewust
ongemoeid**: `barber/uitbetalingen/page.tsx` blijft `createdAt` tonen —
dat scherm gaat over escrow-*status*-geschiedenis, een legitiem andere
vraag dan "wanneer heb ik dit verdiend".

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon. Niet opnieuw
los live doorlopen in deze webapp-repo zelf — de wijziging is mechanisch
identiek aan de al-geverifieerde native fix (zie `KPPRTJE-app`'s eigen
CLAUDE.md voor de volledige verificatie, incl. een rechtstreekse
REST-query die bevestigde dat `completed_at`/`created_at` in de praktijk
daadwerkelijk uiteenlopen).

## "Altijd een aanvraag kunnen versturen" bij automatisch toewijzen (2026-10-05)

Gemeld: bij "snelst beschikbare barber" (automatisch toewijzen) kon de
klant helemaal geen aanvraag versturen zodra er op dat moment niemand
online/in de buurt was — harde blokkade, geen enkele aanvraag kwam ooit
in de database terecht. Gewenst (met de gebruiker afgestemd, zie het
plan-bestand voor de volledige afweging): een klant moet **altijd** een
ASAP-aanvraag kunnen versturen, die **1 uur** geldig blijft. Zodra een
barber 'm claimt — nu, of pas zodra hij later online komt (dat laatste
werkt al via de bestaande live-RLS-poll, geen wijziging nodig) — gebruikt
die barber zijn **eigen** prijzen (sinds migratie 0041 bepalen barbers
zelf hun prijs per dienst), dus de klant kent de prijs nog niet vooraf en
moet die binnen **30 minuten** na het claimen bevestigen vóór het
doorgaat naar betalen. Weigert de klant, of reageert niet op tijd, dan
staat de aanvraag automatisch weer open voor een andere barber (geen
annulering — dat is een aparte, bewuste klant-actie via de bestaande
annuleer-flow).

**Bewust beperkt tot ASAP** — "plan vooruit" zonder match blijft
geblokkeerd zoals vandaag; de 1-uur/30-minuten-vensters horen bij een
spoedaanvraag, niet bij een over-een-week-geplande afspraak.

**Nieuwe migratie `supabase/migrations/0042_open_broadcast_requests.sql`**
(nog niet gepusht):
- Nieuwe `booking_status`-enumwaarde `price_pending` (tussen `requested`
  en `accepted`) — bewust geen hergebruik van `accepted`: die status zit
  in `ACTIVE_RIDE_STATUSES` op het barber-dashboard, en `isRideDue()` zou
  een asap-boeking met status `accepted` altijd als "nu rijden"-klaar
  beschouwen. Een nieuwe enum-waarde dwingt bovendien elke
  `Record<BookingStatus, ...>`-plek in de TypeScript-code tot een
  compile-fout totdat 'm expliciet is afgehandeld (zelfde eerder bewezen
  patroon als `notification_type`/`barber_status`/`escrow_state`).
- `bookings.price_cents_snapshot`/`duration_minutes_snapshot` zijn nu
  nullable (waren `not null`) — een open-aanvraag heeft bij het
  versturen nog geen gematchte barber om een prijs aan te ontlenen.
- Nieuwe kolommen: `open_request` (true alleen voor dit nieuwe
  aanvraagtype, blijft true ook ná claimen/weigeren — puur een
  historisch label), `requested_services` (jsonb, dienstnamen i.p.v.
  service_id's — er is nog geen barber om een catalogus-id aan te
  ontlenen), `price_confirm_due_at` (30-minuten-deadline, zelfde patroon
  als `payment_due_at` uit 0040).
- Drie nieuwe RPC's: `create_open_broadcast_request()` (maakt de
  prijsloze aanvraag aan, nog geen `booking_services`-rijen),
  `claim_open_broadcast_request()` (barber claimt 'm tegen zijn EIGEN
  prijzen — zoekt zijn services op naam op, berekent het bedrag ter
  plekke, zet status naar `price_pending` i.p.v. `accepted`, maakt dan
  pas de `booking_services`-rijen aan), `decline_price_and_reopen()`
  (klant weigert — maakt de claim ongedaan, aanvraag valt terug naar
  `requested`, opnieuw zichtbaar/claimbaar voor een andere barber).
- `barber_matches_location_and_service()` herschreven met een tweede
  matchpad (op `requested_services`-namen i.p.v. `booking_services`-
  regels, voor een aanvraag die nog niet geclaimd is).
- `barber_is_online_and_available()` herschreven: `price_pending`
  toegevoegd aan de actieve-boeking-uitsluiting — een barber die al op
  een klant-bevestiging wacht, telt niet meer als "beschikbaar" voor een
  nieuwe match/claim.
- Vier bestaande RLS-policies (0040) krijgen `or bookings.open_request`
  — zonder dit ziet geen barber een open-ASAP-aanvraag-zonder-prijs ooit
  (die heeft per definitie geen `payments`-rij en `requested_asap=true`,
  dus de bestaande `(booking_has_payment(..) or not requested_asap)`-
  voorwaarde is daar altijd `false`).
- `check_booking_status_transition()`/`notify_customer_on_status_change()`
  herschreven met nieuwe toegestane overgangen/meldingen voor
  `price_pending` (binnenkomen, klant-bevestiging, terugval naar
  `requested`).
- Nieuwe pg_cron-job `expire-price-pending-requests-job` (elke 5 min,
  zelfde cadans als de bestaande crons) — **reopen, geen cancel**: een
  verlopen `price_confirm_due_at` zet de claim terug naar `requested`
  (zelfde reset als `decline_price_and_reopen()`), geen refund-stap
  nodig (er is nooit iets afgeschreven vóór een prijs bekend is).

**`src/app/api/cron/expire-stale-requests/route.ts`**: de bestaande
30-minuten-cron filtert nu `open_request=false` (normale aanvragen
ongewijzigd), plus een nieuwe, parallelle 1-uurs-tak specifiek voor
onge­claimde open-aanvragen — dit is de enige échte "definitief dood"-
grens voor het hele traject (vanaf de oorspronkelijke `created_at`, nooit
gereset door een tussentijdse claim-en-weigering).

**Nieuw bestand `src/app/api/cron/expire-price-pending-requests/
route.ts`** — de 30-minuten-prijsbevestigingsdeadline, losse
single-purpose-route (zelfde conventie als de andere expiry-crons).

**UI**: `klant/boeking/page.tsx` blokkeert niet meer bij 0 matches voor
een ASAP-aanvraag (alleen nog voor gepland, via de bestaande
`/klant/fout/nobarbers`-redirect) — toont in plaats daarvan de gevraagde
diensten zonder prijs en verstuurt via een nieuwe
`createOpenBroadcastRequest()`-helper (`queries.ts`). `klant/status/
page.tsx` kreeg een `price_pending`-tak met drie acties ("Akkoord, ga
naar betalen", "Weiger, zoek een andere barber" — nieuwe inline Dialog,
en de bestaande "Annuleer aanvraag"-flow die nu ook `price_pending`
accepteert). `barber/aanvraag/page.tsx` toont voor een open-aanvraag een
voorvertoning-prijs (opgehaald uit de eigen services van de ingelogde
barber, puur ter preview — de RPC berekent het autoritatieve bedrag
opnieuw) en claimt via de nieuwe RPC i.p.v. de kale status-update, route
altijd terug naar het dashboard (nooit de ritflow in — er is nog geen
bevestigde klant). `BookingRecord.priceCents`/`durationMinutes` zijn nu
`number | null` — dit dwong via TypeScript-compile-fouten elke
aanraakplek in de hele codebase af (`barber/afspraak/page.tsx`,
`barber/rit/page.tsx`, `klant/annuleren/page.tsx`, `barber/dashboard/
page.tsx`'s `STATUS_BADGE`, `klant/home/page.tsx`'s
`ACTIVE_STATUS_LABEL`) — overal een null-safe fallback toegevoegd, met
een toelichting per plek of dat puur defensief is (die status wordt daar
nooit écht bereikt) of een echt bereikbaar nieuw pad.

**Zelfde feature ook 1-op-1 native gebouwd** — zie `KPPRTJE-app`'s eigen
CLAUDE.md voor de volledige toelichting van de native-specifieke
architectuur (elk scherm doet eigen inline Supabase-calls, geen gedeelde
`queries.ts` zoals hier).

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint` schoon op beide
repo's.

## Migratie 0042 opgesplitst + live geverifieerd, twee echte bugs gevonden (2026-10-05)

De oorspronkelijke migratie heette eenmalig `0042_open_broadcast_
requests.sql` maar `supabase db push` faalde met SQLSTATE 55P04
("unsafe use of new value ... in the same transaction"): Postgres
staat niet toe dat een zojuist toegevoegde enum-waarde in dezelfde
transactie al gebruikt wordt door een `language sql`-functie (die
wordt direct bij `create function` tegen de catalogus gevalideerd, in
tegenstelling tot `language plpgsql`, waarvan de body pas bij de
eerste aanroep gelezen wordt) — `barber_is_online_and_available()`
deed dat. Opgesplitst in **0042_price_pending_enum_value.sql** (alleen
de `alter type ... add value`, eigen gecommite migratie) en
**0043_open_broadcast_requests.sql** (de rest, ongewijzigd). Dit
patroon (enum-waarde in een eigen voorafgaande migratie) is het nieuwe
precedent voor elke toekomstige `add value` die in dezelfde ronde door
een `language sql`-functie gebruikt wordt.

Daarna de **volledige flow live doorlopen** met de testaccounts
(`test1234@test.nl`/`test12345@test.nl`, rechtstreeks via RPC/REST —
niet via de UI, zelfde reden als altijd: klik-flakiness in de
browser-tool). Twee echte, niet-getheoretiseerde bugs gevonden en
gefixt:

- **0044**: `claim_open_broadcast_request()` is `SECURITY DEFINER` en
  query't/update't `bookings` dus BUITEN RLS om — de aanname in 0043
  ("de RLS-select-policy is de poort, geen aparte check nodig") klopt
  niet voor een SECURITY DEFINER-functie se eigen interne queries. Live
  aangetoond: een bewust **offline** testbarber kon een open aanvraag
  alsnog claimen. Fix: `barber_is_online_and_available()` +
  `barber_matches_location_and_service()` nu expliciet herhaald binnen
  de functie, vóór er iets wijzigt.
- **0045**: `check_booking_status_transition()`'s bewaking op
  `barber_id`-wijzigingen had maar één uitzondering (claimen). Elke
  andere wijziging — inclusief `decline_price_and_reopen()`'s
  `barber_id -> null` — werd altijd geweigerd. De "weiger, zoek een
  andere barber"-knop zou voor **geen enkele klant** ooit gewerkt
  hebben. Fix: een tweede bypass toegevoegd voor exact die overgang.

**Volledig live bevestigd** (webapp-commits `eaea4d8`/`927b602`/
`c79521a` gepusht naar `origin/main`, Vercel-deploy afgewacht vóór de
cron-tests):
1. Aanvragen zonder online barber → `open_request=true`, geen prijs.
2. Barber online brengen → zichtbaar via bestaande live-RLS-poll
   (geen wijziging nodig, zoals verwacht).
3. Claimen → `price_pending`, prijs/duur correct uit de EIGEN services
   van de claimende barber, `price_confirm_due_at` 30 min vooruit,
   `booking_services` correct aangemaakt.
4. Klant akkoord → `accepted` (bestaand betaal-pad).
5. Klant weigert → terug naar `requested`, `booking_services`
   opgeruimd, meteen weer zichtbaar voor een (andere) barber.
6. Klant annuleert (via de echte `/api/stripe/cancel-and-refund`-
   route) → `cancelled`, geen kosten (nog nooit betaald vóór een
   prijs bekend is).
7. `expire-price-pending-requests`-cron (handmatig getriggerd, 30-min
   deadline kunstmatig in het verleden gezet) → reopen, identiek aan
   `decline_price_and_reopen()`.
8. `expire-stale-requests`-cron, de nieuwe 1-uurs-tak (handmatig
   getriggerd, `created_at` kunstmatig 65 min terug gezet) → definitief
   geannuleerd met de juiste "niemand heeft binnen 1 uur gereageerd"-
   tekst.

**Zijdelings gevonden en gefixt**: de primaire demo-barber
(`test12345@test.nl`) had `lat`/`lng` = null in `barber_profiles` —
geocoding was hier nooit voor gezet, dus deze account kon NOOIT via
locatie gematcht worden, los van online-status. Rechtgezet naar een
Nijmegen-coördinaat (zelfde stad als `city`) zodat dit account weer
bruikbaar is voor matching-demo's. Niet gerelateerd aan het eerder onderzochte "Randy van Londen"-account
(een ander, niet-geseed account — dat bleek simpelweg niet online
gezet, geen bug, zie de native repo's CLAUDE.md voor die bevinding).

## "Boeking kan niet meer betaald worden" + betaalscherm-fixes (2026-10-05)

Twee door de gebruiker gemelde problemen op het echte betaalscherm.

**Onbetaalde boeking bleef als "lopende boeking" staan**: de boeking
wordt al aangemaakt (status `requested`, geen betaling) vóórdat
`/klant/betaling` ooit rendert — terugnavigeren annuleerde 'm nooit,
dus bleef 'ie tot de 30-minuten-cron als actieve boeking op Home staan
(`.not("status","in","(completed,cancelled)")`), terwijl geen barber
'm ooit kon zien (RLS vereist `booking_has_payment()`). Gefixt in
`src/app/klant/betaling/page.tsx`: de terugknop annuleert nu eerst de
boeking (`status='requested' -> 'cancelled'`) vóórdat `router.back()`
loopt. **Bewust aan de expliciete terugknop gehangen, niet aan een
generieke unmount-`useEffect`**: bij iDEAL navigeert
`stripe.confirmPayment({redirect:"if_required"})` de hele pagina weg
naar een Stripe-gehoste pagina — een cleanup-effect zou die navigatie
ook als "verlaten zonder betalen" zien en een boeking met een
onderweg-zijnde betaling verkeerd annuleren. Zelfde bug + zelfde fix
ook in de native app (`KPPRTJE-app/src/app/klant/betaling.tsx`) — daar
wél via een unmount-`useEffect`, want de native PaymentSheet handelt
redirect-vereisende methodes in een eigen modal af zonder het scherm
te unmounten, dus die race bestaat daar niet.

**"Deze boeking kan niet meer betaald worden" (409)** — een
pre-existing bug, niet geïntroduceerd door bovenstaande fix of door de
0042/0043-feature, maar wel daardoor aan het licht gekomen.
`src/app/api/stripe/create-payment-intent/route.ts` accepteerde sinds
de invoering ooit alleen `status === 'requested'`. Twee latere flows
landen echter op `/klant/betaling` terwijl de status al naar
`accepted` is opgeschoven: de "Betaal nu"-knop voor geplande boekingen
(`payment_due_at`, commit `3d94ba9`, "Defer payment to after barber
acceptance") én de nieuwe "Akkoord, ga naar betalen"-knop na een
price_pending-bevestiging (0042/0043). Beide liepen hier altijd op
vast. Root cause: de `existingPayment`-check (plus Stripe's
`idempotencyKey: payment-intent-${bookingId}`) is de eigenlijke
bescherming tegen dubbel betalen — niet deze statuscheck — dus de
check verruimd naar `status !== 'requested' && status !== 'accepted'`.
Live geverifieerd tegen de lokale dev-server (productie-Supabase):
nieuwe price_pending-flow slaagt nu (`200`, echte `clientSecret`), de
oorspronkelijke `requested`-weg nog steeds ongewijzigd werkend (geen
regressie), en een al-geannuleerde boeking nog steeds correct
geweigerd (`409`).

Beide fixes gecommit en gepusht (`d02436a` native, `107c0e2` + `bd2f8d5`
webapp) — Vercel deployt automatisch; de native fix zit nog niet in een
build.

## Betaal-gate permanent uitgeschakeld voor open-broadcast-boekingen (2026-10-05)

Gemeld door de gebruiker: "Vandaag verdiend" op het barber-dashboard
steeg niet na het afronden van een echte rit. Root cause bleek veel
ernstiger dan een weergave-bug: de afgeronde boeking
(`1d55f0a1-8968-4c98-8ece-9ae2906bfe93`, via barber "Randy van Londen")
had `status='completed'` met een echte `price_cents_snapshot`, maar
**geen enkele rij in `payments`** — de barber had de hele rit
(geaccepteerd → onderweg → aangekomen → bezig → afgerond) kunnen
doorlopen zonder dat de klant ooit heeft betaald.

**Root cause**: de "Assigned barbers can update ..."-RLS-policy
(0040) had altijd `booking_has_payment(..) or not requested_asap` als
eis voor elke statuswijziging door de toegewezen barber — met 0040's
eigen comment "de betaal-gate blijft wél onverkort gelden voor
asap-boekingen". 0042/0043 voegde daar `or bookings.open_request` aan
toe zodat een barber een price_pending-claim kon annuleren vóór de
klant heeft bevestigd (waar nog geen betaling kán bestaan) — maar
`open_request` blijft voor altijd `true` op zo'n boeking (bewust, zie
`create_open_broadcast_request`'s comment: "puur een historisch
label"). Daardoor was de betaal-gate niet alleen tijdens het claimen
uitgeschakeld, maar voor **de hele rest van de rit** — elke volgende
statusovergang (inclusief `accepted -> en_route`, het moment waarop de
barber daadwerkelijk vertrekt) ging eraan voorbij.

**Fix**: [0046_fix_open_request_payment_bypass.sql](supabase/migrations/0046_fix_open_request_payment_bypass.sql)
— de `open_request`-uitzondering geldt nu alleen nog zolang
`status = 'price_pending'`. Zodra de klant bevestigt (`-> accepted`)
geldt de oorspronkelijke, onverkorte betaal-eis weer.

**Live geverifieerd** (nieuwe open-aanvraag, geclaimd, klant bevestigd
naar `accepted`, géén betaling):
1. Annuleren vanuit `price_pending` werkt nog gewoon (barber-kant).
2. De exploit zelf — barber direct naar `en_route` zonder betaling —
   wordt nu correct geblokkeerd door RLS (0 rijen geraakt, status
   blijft `accepted`).
3. Na het simuleren van een echte `payments`-rij (zoals de Stripe-
   webhook die zou aanmaken) slaagt dezelfde `en_route`-overgang wél.

De originele kapotte boeking van de gebruiker is bewust ongemoeid
gelaten (test-exploratie, geen echte klant) — "Vandaag verdiend" sloot
'm al terecht uit (geen `payments`-rij = niet meegeteld), dat deel was
dus nooit het probleem; het probleem was dat de rit er ooit kón komen
zonder betaling.

## Volledige audit van het betaal-pad + laatste twee gaten gesloten (2026-10-06)

Na drie losse live-gevonden betaal-bypass-bugs in korte tijd (0042-0046)
vroeg de gebruiker expliciet om een volledige audit in plaats van nog
meer losse fixes. Elke laag nagelopen die een boeking richting
"bevestigd"/verder kan duwen: alle RLS-policies op `bookings`
(`pg_policies`, niet uit migratiebestanden gereconstrueerd — de live
staat), `check_booking_status_transition()`, de Stripe-webhook
(`/api/stripe/webhook`), de confirm-payment-fallback
(`/api/stripe/confirm-payment`), kolom-niveau UPDATE-grants op
`bookings`/`payments`, en elke server-side cron-/adminroute die
`bookings.status` zet (`grep` op elke `.update({status: "accepted"|
"en_route"|...})`-vorm in `src/app/api`).

**Bevestigd solide**: de Stripe-webhook en confirm-payment schrijven een
`payments`-rij uitsluitend op basis van een door Stripe zelf
geverifieerd `payment_intent.succeeded` (confirm-payment haalt de
PaymentIntent zelfs opnieuw rechtstreeks bij Stripe op, vertrouwt nooit
een client-signaal) — zie `src/lib/payment-reconcile.ts`, gedeeld door
beide plus de reconcile-cron. `authenticated` heeft geen UPDATE-grant op
`price_cents_snapshot` of enig ander prijsveld, en geen INSERT/UPDATE op
`payments` — prijsmanipulatie of een nep-betaling kan dus niet, zelfs
niet via een rechtstreekse REST-call. Elke cron/admin-route die
`bookings.status` zet, doet dat uitsluitend annulerend, op één na
(`admin/bookings/force-resolve`, admin-only en alleen bereikbaar vanaf
`arrived`/`in_progress` — dus altijd al voorbij de betaal-gate).

**Twee resterende gaten gesloten** (`0047_close_remaining_payment_gaps.sql`):

1. **"Customers can update own bookings"-RLS-policy had geen
   `WITH CHECK`** — puur `USING (auth.uid() = customer_id)`, verder
   niets. In de praktijk alleen veilig dankzij de hierboven genoemde
   afwezigheid van een prijs-UPDATE-grant (stilzwijgend, niet
   expliciet). Nu een expliciete `WITH CHECK (auth.uid() =
   customer_id)` toegevoegd — zelfde gedrag, maar leesbaar vastgelegd
   i.p.v. impliciet afhankelijk van een andere laag.

2. **Geplande (niet-asap) boekingen konden de hele rit rijden zonder
   ooit betaald te zijn.** De betaal-eis zat uitsluitend in de
   "Assigned barbers can update ..."-RLS-policy, en gold daar met opzet
   niet voor geplande boekingen (`not requested_asap`, 0040: "betalen
   binnen 24 uur ná acceptatie" — een bewuste, losstaande
   betaaltermijn, niet gekoppeld aan het vertrekmoment). Gevolg: een
   barber kon `accepted -> en_route -> ... -> completed` doorlopen
   binnen die 24 uur zonder dat er ooit een `payments`-rij bestond, en
   `expire-unpaid-scheduled-bookings` ving dat niet op (matcht alleen
   nog `status = 'accepted'`, niet een boeking die intussen al verder
   is). Fix: `check_booking_status_transition()` eist nu expliciet
   `booking_has_payment()` bij de overgang `accepted -> en_route`, voor
   **elke** boeking, niet meer alleen asap — het 24-uurs-betaalvenster
   blijft intact (de klant kan nog steeds op elk moment vóór het
   vertrek betalen), alleen het daadwerkelijke vertrekmoment vereist nu
   een bestaande betaling. Bewust in de trigger toegevoegd i.p.v. de
   RLS-policy te wijzigen (minder kans op het stapelen van steeds
   subtielere RLS-uitzonderingen, zoals bij 0043/0044/0046 al gebeurde)
   — `new.status = 'en_route'` is de enige nieuwe voorwaarde,
   annuleren blijft op elk moment onaangetast mogelijk.

**Live geverifieerd**: geplande boeking claimen zonder betaling werkt
nog (ongewijzigd gedrag); `en_route` zonder betaling wordt nu correct
geblokkeerd met een duidelijke foutmelding (`"Nog niet betaald — kan
nog niet van start"`); na een echte betaling slaagt `en_route` alsnog;
annuleren van een onbetaalde geaccepteerde boeking blijft onaangetast
werken.

## payment_due_at niet teruggezet na betaling + "altijd online" + echte pushmeldingen (2026-10-06)

Drie los van elkaar staande punten, zelfde dag.

**`payment_due_at` bleef hangen na een geslaagde betaling** (live
gevonden door de gebruiker: "Betaal nu" bleef staan ná het betalen).
Niets zette dit veld terug naar null zodra er een `payments`-rij
ontstond — trof zowel het nieuwe 15-minuten-venster (0048) als het
al langer bestaande 24-uurs-venster voor geplande boekingen (0040).
Fix (`0049_clear_payment_due_at_on_payment.sql`): een trigger op
`payments` (AFTER INSERT) die de bijbehorende boeking se
`payment_due_at` terugzet naar null, plus een eenmalige backfill voor
al-betaalde boekingen die dit al meemaakten.

**De betaalscherm-annulering-bij-verlaten zelf bleek ook te
agressief** — zie de vorige sectie hierboven, teruggedraaid naar
"gewoon `router.back()`", met de 15-min/24u-vensters + bestaande
"Betaal nu"-knop als het enige vangnet.

**Native had geen directe betaalbevestiging** (in tegenstelling tot de
webapp se `klant/succes/page.tsx`, die meteen bij Stripe zelf navraagt
i.p.v. puur op de webhook te wachten) — na het sluiten van de
PaymentSheet kon het statusscherm een paar seconden "Betaal nu" tonen
voordat de webhook de `payments`-rij had aangemaakt. `klant/
betaling.tsx` roept nu ook `/api/stripe/confirm-payment` aan vóór het
navigeren, zelfde patroon, zelfde reden.

**"Altijd online" totdat zelf uitgezet** — op verzoek van de gebruiker
(`0050_online_stays_on_until_toggled_off.sql`):
`barber_is_online_and_available()` eiste naast `is_online` ook een
verse `last_active_at`-heartbeat (< 90s oud, migratie 0037) — een
barber die de app op de achtergrond zette of het scherm vergrendelde
viel daardoor stil uit de matching, zonder dat `is_online` zelf
veranderde. Dit was deze hele sessie ook al herhaaldelijk een bron van
verwarring tijdens het testen. De heartbeat-eis is verwijderd uit de
beschikbaarheids-check — alleen `is_online` (expliciete toggle,
uitloggen zet 'm al op false), het weekschema en "geen actieve rit"
gelden nog. `last_active_at` zelf blijft bestaan als diagnostisch
gegeven, wordt alleen niet meer gebruikt om beschikbaarheid te gaten.

**Echte pushmeldingen naar de native app** — bestond nog helemaal
niet. `push_subscriptions` (0013) is Web Push voor de browser
(endpoint/p256dh/auth), structureel iets anders dan een simpel
Expo-push-token-string, dus niet hergebruikt. Nieuw:
`profiles.expo_push_token` (0051_expo_push_tokens.sql), en
`/api/notifications/send/route.ts` uitgebreid met een derde pad naast
e-mail/Web Push: een POST naar Expo's gehoste push-API
(`https://exp.host/--/api/v2/push/send`) wanneer er een token bekend
is, met `DeviceNotRegistered` → token opruimen (zelfde patroon als de
bestaande Web-Push-404/410-opruiming). **Geen enkele van de ~15
plekken die een notificatie-rij aanmaken hoefde aangepast te worden**
— de bestaande `fan_out_notification`-trigger (0013) roept deze route
al aan bij elke nieuwe rij, ongeacht bron.

Native kant (zie die repo's eigen CLAUDE.md voor de volledige
toelichting): `expo-notifications` geïnstalleerd, token-registratie bij
inloggen, opruiming bij uitloggen (token hoort bij het toestel, niet de
sessie), en een tik-op-melding-listener die naar het juiste scherm
routeert (samengevoegde `getHref`-mapping van beide bestaande
in-app-notificatielijsten, per rol). **Nog niet device-getest** — vereist
een nieuwe build, en voor iOS vermoedelijk een handmatige
`eas credentials`-stap (Apple-inloggen, kan niet namens de gebruiker).

## Admin-geschillen/escrow-batch: tijdstip, klikbare profielen, handmatige vrijgave, klant-statusbalk (2026-10-07)

Vijf losse wensen in één keer, zie de verzoektekst voor de letterlijke
Nederlandse formulering. Database: `0052_dispute_acknowledgment_and_detail.sql`.

**A. Tijdstip in het geschillenvenster** — `disputes.opened_at` bestond
al sinds de allereerste schema-migratie (0003), werd alleen nergens
getoond. `DisputesTable` toont 'm nu geformatteerd, plus `bookings.address`
(ook al bestaand) voor "waar" — geen schema-wijziging nodig, puur een
weergave-fix in `getDisputesForAdmin()` + `DisputesTable.tsx`.

**C. Klikbare namen → nieuwe gebruikersdetailpagina** — er bestond nog
geen enkele admin-detailpagina (bevestigd: geen `[id]`-dynamic route
onder `/admin`). Nieuw: `/admin/gebruikers/[id]`
(`getUserDetailForAdmin()` in queries.ts) — profiel, rolspecifieke stats
(barber: rating/online-status/stad/Stripe-koppeling; klant:
standaardadres), boekingsgeschiedenis (laatste 30, beide kanten) én
geschillen waar deze gebruiker bij betrokken was (als klant of als
barber) in één overzicht. Klant-/barbernaam in Geschillen en de naam in
de bestaande Gebruikers-lijst linken er nu allebei naartoe.

**D + E. Escrow-logica geëxtraheerd naar `src/lib/escrow.ts`** —
`releasePaymentEscrow()` bevat nu de Stripe-connect-check + atomische
`held → releasing`-claim + transfer + `released`-update, 1-op-1
overgenomen uit wat voorheen alleen inline in de 24u-cron
(`/api/cron/release-escrow`) stond. De cron roept 'm nu aan i.p.v. de
logica te dupliceren; de leeftijd-/booking-status-/open-geschil-checks
blijven bij de cron zelf, dat zijn voorwaarden die alleen daar gelden.

Twee nieuwe aanroepers van diezelfde functie:
- **D: handmatige "Nu vrijgeven"-knop bij Betalingen**
  (`/api/admin/payments/release-escrow`, nieuwe `PaymentsTable.tsx`) —
  alleen zichtbaar bij `escrow_state='held'`, blokkeert expliciet als er
  nog een open geschil op de boeking staat (anders zou deze knop precies
  de bescherming omzeilen waar geschillen/escrow voor bestaan).
- **E: "Vrijgeven aan barber" (dismiss) geeft nu direct vrij** — de
  oude lazy-aanname ("de cron pakt het later toch op") is vervangen door
  een directe aanroep in `/api/admin/disputes/resolve`'s dismiss-tak.
  Mislukt de vrijgave (bv. barber nog niet Stripe-gekoppeld), dan sluit
  het geschil gewoon zonder vrijgave — de cron is en blijft het vangnet
  voor een eventueel nog-'held'-gebleven betaling.

**B. Statusbalk op klant-home** — nieuw: `disputes.customer_acknowledged_at`
+ RPC `acknowledge_dispute(p_dispute_id)` (SECURITY DEFINER, want
disputes is "alleen server-side/admin schrijfbaar" sinds 0003 — geen
kale update-grant aan authenticated, alleen deze ene smalle RPC die
controleert dat de aanroeper de klant van de boeking is én het geschil
al afgehandeld is). Een open geschil heeft per definitie altijd
`acknowledged_at is null` (de RPC staat 'm alleen toe op
resolved/dismissed), dus `getDisputeBannerForCustomer()` kan met één
filter (`is("customer_acknowledged_at", null)`) zowel "nog in
behandeling" als "afgehandeld maar nog niet gezien" vinden. UI: balk
bovenaan klant-home, open-status toont geen knop (niet wegklikbaar
terwijl het nog loopt), resolved/dismissed tonen bewust geschreven
professionele copy (geen placeholder-tekst) + een "Oké!"-knop die de
RPC aanroept en de balk daarna voorgoed verbergt. 1-op-1 gemirrored naar
`KPPRTJE-app/src/app/klant/(tabs)/home.tsx`.

Geen van de vijf onderdelen is al live-geverifieerd met een echte
melding/vrijgave na migratie 0052 — eerstvolgende sessie met
testaccounts moet dat nog doen (`tsc --noEmit`/lint zijn wel schoon op
beide repo's).

## Eerste-keer-rondleiding voor klant en barber (2026-10-08)

Op verzoek van de gebruiker eerst een los klikbaar HTML-voorbeeld
gebouwd en afgestemd (Artifact: spotlight-overlay op een telefoon-
mockup, Klant/Barber-toggle), pas daarna de echte implementatie.

**Nieuw**: `src/components/tutorial/OnboardingTutorial.tsx` —
`position:fixed`-overlay die een opgegeven DOM-element uitlicht
(scrim met een rechthoekig gat + ring + tooltip), met stap-dots, Terug/
Volgende/"Overslaan". Scrollt het doelwit automatisch in beeld als het
(bv. onder de geschillenbalk) buiten de viewport valt. Migratie `0054`:
nieuwe `profiles.tutorial_seen_at`-kolom (**met backfill** — anders
zouden alle bestaande/test-accounts 'm bij de eerstvolgende load alsnog
te zien krijgen, dit is bewust alleen voor nieuwe registraties na de
migratie), `getTutorialSeenAt()`/`markTutorialSeen()`/`resetTutorial()`
in queries.ts.

- **Klant-home** (6 stappen): welkom → adresveld → dienst-tags → "Boek
  direct" → wallet (licht de Profiel-tab-icoon uit, geen navigatie
  nodig — die staat al op hetzelfde scherm via `klant/layout.tsx`) →
  afronding.
- **Barber-dashboard** (5 stappen, bewust geen wallet-stap — op verzoek
  van de gebruiker alleen bij de klant): welkom → online-toggle →
  cijfers → "Nieuwe aanvraag" (licht niets uit als er nu geen live
  aanvraag zichtbaar is — het doelwit bestaat dan simpelweg niet in de
  DOM, de component filtert zo'n stap vanzelf weg) → afronding.
- `Card`-component kreeg een `id`-prop (nodig om 'm als meetbaar
  doelwit te kunnen gebruiken, had die nog niet).
- "Rondleiding opnieuw bekijken" in zowel `/klant/profiel` als
  `/barber/profiel` (zet `tutorial_seen_at` terug op `null`, navigeert
  naar het scherm waar de rondleiding hoort).

**Live doorlopen** via de dev-server met een echt klant-testaccount:
alle 6 stappen correct uitgelicht (incl. de scroll-in-beeld-fix voor
een doelwit dat door de geschillenbalk buiten beeld viel), "Overslaan"
en "Begrepen" ronden 'm netjes af. De barber-kant is alleen via
code-review geverifieerd (zelfde component/patroon, niet apart met een
barber-sessie doorlopen).

1-op-1 gemirrored naar de native app — zie die repo's eigen CLAUDE.md
voor de RN-specifieke kant (`measureInWindow()` i.p.v.
`getBoundingClientRect()`, en de `tutorial-targets.ts`-registry voor de
Profiel-tab-icoon, die in de layout leeft i.p.v. op het scherm zelf).
Op expliciet verzoek van de gebruiker **gebouwd maar bewust nog niet
gebuild** ("ik wil alles in 1x builden") — nog geen device-test.

## "Account verwijderen"-knop op klant/instellingen + barber/profiel (2026-10-08)

Apple's App Store Review Guideline 5.1.1(v) eist dat elke app met
accountaanmaak ook account-verwijdering aanbiedt — relevant nu met de
App Store-indiening in het stappenplan staat. **Bewust geen hard
delete**: `bookings.customer_id`/`barber_id` staan op `on delete
cascade` naar `profiles(id)` (0003) — een echte delete van de
auth.users/profiles-rij zou dus ook alle boekingen/betalingen/facturen
van de ANDERE partij (barber resp. klant) meesleuren, en de wettelijke
7-jaars-bewaarplicht voor de btw-administratie van barbers (0038)
breken.

**In plaats daarvan: login blokkeren + persoonsgegevens anonimiseren**,
boekingen/betalingen/facturen blijven onder het geanonimiseerde profiel
bestaan:
- **Migratie `0055_account_deletion.sql`**: nieuwe `profiles.deleted_at`-
  kolom (puur audit-tijdstip, geen client-grant) + nieuwe security-
  definer-functie `request_account_deletion()` — zet `full_name` op
  "Verwijderd account", wist `phone`, en per rol: klant krijgt
  `profiles.suspended = true` (hergebruikt de bestaande
  schorsings-kolom uit 0016 — geen nieuwe kolom/enum-waarde nodig),
  barber krijgt `barber_status = 'suspended'` (sluit 'm meteen uit van
  élke bestaande `barber_status = 'approved'`-check in de hele app —
  0003/0005/0007/0027/0028/0039/0053 — zonder die checks één voor één
  te moeten aanpassen) + anonimiseert `bio`/`kvk_number`/`city`/
  `address`/`portfolio_urls`/`insurance_doc_url`/`id_doc_url`/`iban`/
  `avatar_url`/`diploma_url` en zet `is_online = false`.
- **Nieuwe route `/api/account/delete`** (`getRequestUser()`, dus ook
  bereikbaar voor de native app): roept de RPC aan via de eigen sessie,
  ruimt daarna (via de service role) de Storage-bestanden onder
  `{userId}/` in `barber-media`/`barber-documents` op, zet een
  **permanente Auth Admin-ban** (`ban_duration: "876000h"`, ~100 jaar —
  geen `deleteUser()`, dat zou dezelfde cascade-ramp triggeren als
  hierboven beschreven), vervangt het e-mailadres door
  `deleted-{userId}@kpprtje.invalid` (zodat het origineel vrijkomt voor
  een nieuwe registratie) en forceert een globale sign-out van de
  sessie.
- **UI**: "Account verwijderen"-rij onder "Uitloggen" op zowel
  `klant/instellingen/page.tsx` als `barber/profiel/page.tsx`, met een
  bevestigingsdialoog die de onomkeerbaarheid en wat er met de
  boekingsgeschiedenis gebeurt expliciet benoemt — zelfde
  `Dialog`-patroon als de bestaande uitlog-bevestiging, geen nieuwe
  Button-variant nodig (destructieve bevestigingen in dit project
  gebruiken al langer gewoon `variant="secondary"`, zie
  `klant/annuleren/page.tsx` — de dialoogtekst draagt de waarschuwing,
  niet de knopkleur).
- **Bekend, geaccepteerd randgeval**: een klant krijgt
  `profiles.suspended = true` gezet, maar de auth-ban blokkeert het
  inloggen al — een admin die later per ongeluk op "Herstel" klikt bij
  een geanonimiseerd account zou dus geen echte toegang teruggeven,
  puur een inactieve vlag omkeren. Niet verder afgedicht (lage impact,
  geen beveiligingsgat), maar goed om te weten bij een toekomstige
  admin-UI-wijziging rond schorsing.

1-op-1 ook native gebouwd (`klant/instellingen.tsx`/
`barber/(tabs)/profiel.tsx` in `KPPRTJE-app`, dezelfde
`/api/account/delete`-route aangeroepen via Bearer-auth, zelfde
Dialog-patroon als de bestaande uitlog-bevestiging aldaar).

**Geverifieerd**: `npx tsc --noEmit`/`npm run lint` (webapp) en `npx tsc
--noEmit`/`npx expo lint` (native) schoon. **Niet live getest** — vereist
een wegwerptestaccount om een echte verwijdering tegen productie te
bevestigen (ban-gedrag, Storage-opruiming, de `barber_status`-
uitsluiting uit matching/lijsten); nog te doen in een volgende sessie
met testaccount-toegang. Migratie `0055` — nog te pushen door de
gebruiker.

## "Aanvraag wordt weer goedgekeurd" bij betaling starten-en-wegdrukken — root cause gevonden en gefixt (2026-10-10)

Gemeld: een asap-aanvraag lijkt weer "goedgekeurd" zodra de klant op
"Akkoord, ga naar betalen" tikt en daarna de betaling wegdrukt zonder te
betalen. **Hard gereproduceerd** (niet aangenomen) via directe RPC/REST-
calls met de bestaande testaccounts: `create_open_broadcast_request` →
`claim_open_broadcast_request` → klant bevestigt de prijs (exact de
`.update({status:'accepted'}).eq('status','price_pending')`-call die
`klant/status`/native `klant/booking/[id].tsx` ook doet) → boeking staat
op `status: 'accepted'`, `payment_due_at` 15 min vooruit (0048 werkt dus
al correct), **geen `payments`-rij**.

**Root cause zat niet in het betaalscherm** (dat gedrag — `router.back()`,
geen agressieve annulering-bij-verlaten — is al eerder bewust zo gelaten,
zie 0048/0049) **maar in `barber/dashboard/page.tsx`/`barber/rit/page.tsx`**:
`payment_due_at` staat sinds migratie `0048` ook op een net-bevestigde
**asap**-boeking (15 min), niet meer uitsluitend op een geplande boeking
(24u, sinds 0040) — maar de "Actieve rit"-kaart en de rit-flow zelf
checkten dit veld nergens, alleen de "Geplande afspraken"-sectie deed dat
(met een inmiddels **stale** comment die expliciet zei "paymentDueAt
staat alleen op een geaccepteerde GEPLANDE boeking", geschreven vóór
0048 bestond). Gevolg: een onbetaalde, net-bevestigde asap-boeking
(`isRideDue()` is voor asap altijd waar) verscheen op het barber-
dashboard als een volwaardige "Actieve rit" — géén "Wacht op
betaling"-signaal, gewoon klikbaar door naar `/barber/rit`, waar de
barber op "Vertrek" kon tikken en pas dán (via de DB-trigger uit 0047)
een foutmelding kreeg. Precies de illusie van "goedgekeurd" die gemeld
werd.

**Fix** (geen architectuurwijziging — status wordt bewust nog steeds
vóór betaling op `accepted` gezet, zie 0040/0042/0048's eigen
toelichting waarom; dit is puur een weergave-/CTA-gat gedicht):
- `barber/dashboard/page.tsx`: "Actieve rit"-kaart toont nu ook
  `<Badge variant="error">Wacht op betaling</Badge>` zodra
  `activeBooking.paymentDueAt` gezet is. Stale comment bij "Geplande
  afspraken" gecorrigeerd (payment_due_at geldt sinds 0048 voor beide
  gevallen).
- `barber/rit/page.tsx`: nieuwe `awaitingPayment`-afleiding
  (`status === 'accepted' && paymentDueAt`). Zolang waar: de
  status-badge toont "Wacht op betaling" i.p.v. "Bevestigd", en de
  "Vertrek"-knop wordt vervangen door een info-tekst ("Wacht tot de
  klant de prijs heeft betaald voordat je kunt vertrekken.") i.p.v. een
  knop die toch zou falen.
- Data was al beschikbaar (`BOOKING_COLUMNS`/`mapBooking()` selecteren
  `payment_due_at` al sinds 0040) — puur een render-/gating-fix, geen
  nieuwe query's.

1-op-1 ook native gefixt (`barber/(tabs)/dashboard.tsx`,
`barber/rit.tsx` in `KPPRTJE-app` — die laatste selecteerde
`payment_due_at` nog helemaal niet, nu toegevoegd aan `BOOKING_COLUMNS`).

**Geverifieerd, inclusief de fix zelf live bevestigd** (niet alleen de
root cause): met de reproductie hierboven nog actief (dezelfde
onbetaalde testboeking) ingelogd als `test12345@test.nl` op de lokale
dev-server — "Actieve rit"-kaart toont nu "Wacht op betaling", en
`/barber/rit` toont de "Wacht tot de klant..."-tekst i.p.v. een
"Vertrek"-knop. Testdata nadien opgeruimd (boeking + `booking_services`
verwijderd, testbarber weer offline gezet). `npx tsc --noEmit`/`npm run
lint` schoon.

## Vervolg — de badge was niet genoeg: de échte fix is "payment gates acceptance" (2026-10-10)

De gebruiker wees de badge-fix hierboven terecht af: een badge verbergt
het probleem, maar de boeking werd nog steeds al "goedgekeurd" (status
`accepted`) gezet vóórdat er iets betaald was — precies zodra de klant op
"Akkoord, ga naar betalen" tikte, dus al bij het *starten* van een
betaling, niet pas na het *slagen* ervan. Expliciete instructie: "aanvraag
mag pas doorgezet worden na bevestiging van betaling."

**Het al bestaande, bewezen patroon elders in dit project teruggevonden**
(`git log --oneline | grep -i payment` als zoekmethode) en hier
toegepast: een **directe** asap-boeking wordt al sinds Fase 6 pas
zichtbaar voor de barber ná een geslaagde betaling (RLS eist
`booking_has_payment()`) — de open-broadcast-prijsbevestigingsflow
(0042/0043/0048) volgde dat principe nooit, en zette `accepted` juist
vóór betaling, met alleen een vervallende deadline (15 min, 0048) als
vangnet. Die inconsistentie was de eigenlijke, herhaaldelijk terugkerende
bron van dit "lijkt goedgekeurd"-probleem — niet iets dat met een UI-
badge op te lossen is.

**Architectuurfix (geen migratie nodig — de bypass voor service-role-
updates in `check_booking_status_transition()`, `auth.uid() is null`,
bestond al)**:
- **`klant/status/page.tsx`'s `handleConfirmPrice()`**: doet nu
  helemaal geen `.update()` meer — stuurt alleen door naar
  `/klant/betaling`. De boeking blijft dus gewoon `price_pending` zolang
  er niet betaald is. `confirmingPrice`-state (overbodig zonder async
  call) en de nu-ongebruikte `updateBookingStatus`-import verwijderd.
- **`src/app/api/stripe/create-payment-intent/route.ts`**: `price_pending`
  toegevoegd aan de toegestane statussen (naast `requested`/`accepted`)
  — anders zou deze route een PaymentIntent voor deze boeking weigeren.
- **`src/lib/payment-reconcile.ts`'s `recordSucceededPaymentIntent()`**:
  nieuwe stap ná de geslaagde `payments`-insert — als de boeking op dat
  moment `price_pending` is, zet 'm door naar `accepted` (service-role-
  update, dus de transitie-trigger z'n `auth.uid() is null`-bypass geldt
  meteen). Dit is **de enige plek** die een price_pending-aanvraag nu nog
  "goedkeurt" — en dat gebeurt dus pas ná een bevestigde betaling, nooit
  ervoor. Gebruikt door de webhook, `/api/stripe/confirm-payment` én de
  reconcile-cron, dus alle drie de paden krijgen dit gratis mee.
- **Geen wijziging nodig aan** `expire-price-pending-requests` (de
  30-minuten-cron op `price_confirm_due_at`) — die vangt nu vanzelf ook
  "klant tikte Akkoord maar betaalde nooit" op, want de boeking verlaat
  `price_pending` niet meer totdat er echt betaald is. De losse
  15-minuten-`payment_due_at`-tak uit 0048 (price_pending -> accepted
  zonder bestaande betaling) wordt hierdoor dode code — bewust niet
  verwijderd/gemigreerd, onschadelijk inert, en nog steeds het juiste
  vangnet mocht er ooit weer een ander pad ontstaan dat wél vroegtijdig
  naar accepted zet.
- De dashboard-/rit-badge-fix van hierboven blijft staan — niet fout,
  gewoon niet de kern van dit probleem; blijft wel relevant voor het
  aparte, nog steeds legitieme geval van een **geplande** boeking die
  door de barber geaccepteerd is maar binnen het 24-uursvenster nog niet
  betaald (dat `accepted`-vóór-betaling-patroon is daar wél bewust zo
  ontworpen, zie 0040).

**Geverifieerd — volledig end-to-end tegen productie, niet alleen
aangenomen**: een verse open-broadcast-aanvraag aangemaakt en geclaimd
(zelfde testaccounts), daarna `create-payment-intent` aangeroepen (de
"start betaling"-stap) — **boeking bleef `price_pending`**,
`payment_due_at` bleef `null`, en verscheen **niet** in de barber se
actieve-boekingen-query (exact het scenario dat eerder "weer
goedgekeurd" oogde). Daarna de PaymentIntent écht laten slagen (Stripe
testkaart, `pm_card_visa`, server-side confirm) en `/api/stripe/
confirm-payment` aangeroepen zoals de app dat ook doet — pas toén
sprong de boeking naar `accepted`, met een echte `payments`-rij
(`escrow_state: held`). Testbetaling nadien terugbetaald via de Stripe
API, alle testdata opgeruimd. `npx tsc --noEmit`/`npm run lint` schoon.
