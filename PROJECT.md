# Groomy — MVP

Marketplace voor mobiele zzp-barbers ("Uber voor barbers"). Klanten boeken een
barber op locatie; de betaling gaat in escrow en wordt na afronding
vrijgegeven, tenzij binnen 24 uur een geschil wordt geopend.

## Status: Live in productie op Vercel (post-launch, 2026-08-14)

De app draait sinds 2026-08-13/14 daadwerkelijk live op
`barberapp-vz1z.vercel.app` (test-mode Stripe-sleutels, bewust — zie
"Openstaande acties voor jou" hieronder voor de stap naar live-mode).
Repo: `github.com/randylucassen/Barberapp`, main-branch auto-deployt naar
Vercel. `app_config.api_base_url` staat op de productie-URL, dus de
bestaande `pg_cron`-jobs (escrow-release, expire-stale-requests, en sinds
vandaag ook reconcile-payments) vuren nu echt.

We zitten nu in een doorlopende **post-launch-fase**: de gebruiker test
de app actief met échte boekingen (o.a. familie) en meldt wat er
misgaat; elke fix wordt gepland/gebouwd/geverifieerd/gepusht volgens
dezelfde discipline als de Fase 0-11-bouw. Het **gedetailleerde,
chronologische logboek van elke individuele fix** (wat, waarom, hoe
geverifieerd) staat in `CLAUDE.md`'s Statuslog — dat groeit vrijwel elke
sessie en wordt hier bewust niet 1-op-1 gedupliceerd. Wat hier in
PROJECT.md thuishoort is de architectuur zelf (Fase-secties hieronder) en
verzamelpunten (Bekende gaps / Openstaande acties) — die worden
bijgewerkt zodra een fix daadwerkelijk iets aan de architectuur of aan
een openstaande beslissing verandert, niet bij elke losse bugfix.

Twee noemenswaardige structurele wijzigingen sinds de pre-launch-audit
hieronder, die de Fase 2/5/6-architectuur op detailniveau achterhalen
(de Fase-secties zelf zijn niet herschreven, maar deze twee wijken er
inmiddels van af):
- **Meerdere diensten per boeking** (migratie `0027`): `bookings.
  service_id`/`party_size` bestaan niet meer — vervangen door een
  `booking_services`-junction-tabel (één rij per {dienst, aantal}) plus
  `create_booking_with_services()` als enige geldige weg om een boeking
  aan te maken. Zie de bijbehorende CLAUDE.md-changelog-entry voor de
  volledige toelichting.
- **Vooruit plannen bij een specifieke barber vereist nu een eerder
  afgeronde boeking met diezelfde barber** (migratie `0029`) — een nieuw
  account moet de eerste keer altijd via een live aanvraag (Nu/broadcast)
  gaan. Zowel client-side gefilterd als server-side afgedwongen in
  `create_booking_with_services()`.

## Status: Pre-launch audit (Critical/High afgehandeld)

Fase 0 t/m 11 zijn afgerond — de roadmap zelf is compleet. Vóór een echte
livegang is de **volledige codebase doorgelicht** als een senior engineer
die een startup op de eerste échte gebruikers voorbereidt: architectuur,
beveiliging, RLS, Stripe/escrow, performance, matching, notificaties,
reviews, adminpanel, foutafhandeling en UX. Alle **Critical**- en
**High**-bevindingen zijn direct opgelost; **Medium**/**Low** staan als
bewuste, genoteerde vervolgpunten in "Bekende gaps" hieronder. Zie
"Pre-launch audit — architectuur" voor de volledige toelichting per fix.

> **Methode (2026-07-19)**: vier gespecialiseerde reviewers hebben
> parallel de codebase doorgelicht (security/toegang, betalingen/
> financiële integriteit, business-logica/data-integriteit, frontend-UX/
> foutafhandeling), elk met opdracht om alleen bevindingen te rapporteren
> die daadwerkelijk in de code getraceerd waren — geen speculatie. Elke
> Critical- en de meeste High-bevindingen zijn daarna **zelf opnieuw
> geverifieerd** door de exacte policy/grant/trigger/route te lezen vóór
> er iets gefixt werd (bv. de `bookings`-insert-grant en de
> `stripe_payouts_enabled`-kolomgrant zijn beide met een directe
> `grep`/read bevestigd, niet alleen op het woord van de reviewer
> aangenomen). `npm run build`/`npm run lint` zijn schoon ná alle fixes;
> een aantal wijzigingen (de nieuwe `/admin/boekingen`-flow, de
> escrow-cron-race-fix, dubbele-betaling-preventie) kon **niet** end-to-
> end met een echte ingelogde sessie getest worden binnen deze sessie
> (geen testaccount-credentials beschikbaar) — wél bevestigd: build/
> type-check slaagt, de nieuwe pagina's/routes renderen zonder
> console-fouten, en elke wijziging is stap voor stap tegen de bestaande
> RLS-policies/triggers doorgelezen. Aanrader: loop de "Verificatie"-
> stappen in "Pre-launch audit — architectuur" hieronder zelf nog eens
> door na de migratie-push.

> **Vervolg — gevonden tijdens echt gebruik door de gebruiker
> (2026-07-19)**, precies het aanbevolen "loop dit zelf nog eens door"-
> traject hierboven: twee extra problemen kwamen boven, geen van beide
> door de vier reviewers gezien (lag buiten hun scope) noch door mij
> voorzien.
> 1. **Regressie**: een nieuw aangemaakt barber-account kreeg een
>    FK-fout bij het opslaan van diensten tijdens `/barber/aanmelden`.
>    Oorzaak: `0016_admin_fase10.sql` verving `handle_new_user()` volledig
>    om de admin-rol te ondersteunen, en liet daarbij per ongeluk de
>    `insert into barber_profiles`/`insert into customer_profiles` weg
>    die sinds `0003` bestond. Elke klant/barber die sindsdien
>    registreerde (incl. de eigen `randylucassen@gmail.com`-testaccount
>    van de gebruiker) mist die extensierij. `0018_fix_missing_profile_
>    extensions.sql` herstelt de trigger én backfilt met terugwerkende
>    kracht (algemene `not exists`-insert, niet aan specifieke user-id's
>    gebonden — repareert dus ook accounts die nu nog niet bekend zijn).
> 2. **Verificatiestatus was zichtbaar maar niet afgedwongen**: een
>    `pending`/`rejected`-barber kon gewoon bij `/barber/dashboard` komen
>    en zichzelf online zetten — bewust zo gelaten in Fase 10 (matching
>    sluit ze toch al stilzwijgend uit), maar in de praktijk verwarrend:
>    geen zichtbare status, geen idee waarom er nooit een aanvraag komt.
>    `middleware.ts` dwingt dit nu af (zie "Pre-launch audit —
>    architectuur" hieronder) en `/barber/in-behandeling` is de enige
>    plek waar zo iemand nog kan komen.
>
> Beide bevestigd via een echte browsersessie: een pending barber die
> inlogt landt direct op `/barber/in-behandeling`, en een directe
> navigatiepoging naar `/barber/dashboard` wordt teruggestuurd. `npm run
> build`/`npm run lint` schoon. Migratie `0018` moet nog gepusht worden.

## Status: Fase 11 — Productie (afgerond)

Fase 0 t/m 10 zijn afgerond en end-to-end getest — de roadmap is hiermee
**compleet**. Fase 11 bouwt geen nieuwe feature maar maakt de app
productie-klaar: security headers + CSP, ontbrekende error-/404-
boundaries, Sentry-foutmonitoring, rate limiting op de kwetsbaarste
routes, SEO-basis (robots/sitemap/OG), `next/image` voor Storage-
afbeeldingen, een volledig env-vars-overzicht en een concrete checklist
voor het moment van livegang. Zie "Fase 11 — architectuur" hieronder voor
de volledige toelichting, en "Checklist voor live gaan" voor de
stappen die alleen jij kan zetten (accounts aanmaken, Stripe naar live
mode, domein).

> **Build/lint/browser-geverifieerd (2026-07-19)**. Tijdens het bouwen
> bleek de aanvankelijke aanname dat de escrow-release-cron nog
> "handmatig" draaide **onjuist** — Fase 6 had daar in `0011` al een
> echte `pg_cron`/`pg_net`-scheduled job voor ingericht (elke 15
> minuten, via `app_config.api_base_url`). Een extra Vercel Cron-config
> zou die simpelweg dupliceren, dus die is bewust **niet** gebouwd — in
> plaats daarvan staat in de checklist hieronder dat je zodra de app een
> echte deploy-URL heeft, `app_config.api_base_url` in de SQL Editor moet
> bijwerken (de placeholder-waarde slaat de job tot dan bewust over, met
> een `notice`, i.p.v. te falen). Verder geverifieerd: `error.tsx` vangt
> een geforceerde `throw` op en toont de NL-pagina (bevestigd via een
> tijdelijke testpagina, meteen weer verwijderd); `not-found.tsx` toont
> nette NL-copy op een onbestaand pad (bevestigd via browser-screenshot);
> `/robots.txt` en `/sitemap.xml` serveren correct; de security headers
> (`Strict-Transport-Security`, `X-Frame-Options`, etc.) zijn aanwezig op
> elke response; de CSP staat bewust **uit** in `next dev` (zou anders
> Next.js' eigen HMR breken) en actief **aan** in een productie-build.
> Rate limiting kon niet end-to-end tegen een echte 429 getest worden
> (vereist een Upstash-database, pas relevant ná deploy) — de helper
> valt zonder Upstash-credentials bewust stil terug op "geen limiet"
> (geverifieerd: routes werken lokaal gewoon door), dus dit blokkeert
> lokaal ontwikkelen niet.

## Fase 10 — Admin Dashboard (afgerond)

Fase 0 t/m 9 zijn afgerond en end-to-end getest. Fase 10 bouwt de eerste
admin-functionaliteit in de app: gebruikersbeheer (incl. schorsen),
barbers goedkeuren, geschillen behandelen, betalingen bekijken, reviews
verwijderen, statistieken, kortingscodebeheer, en een logboek van elke
admin-actie. Draait in dezelfde Next.js-app onder `/admin/*` (geen aparte
deploy) — een admin-account is een losstaande `admin_users`-rij, geen
`profiles`-rij, met een eigen `/admin/login` zonder enige kruisverwijzing
vanuit klant-/barberschermen. Zie "Fase 10 — architectuur" hieronder voor
de volledige toelichting (identiteitsmodel, toegangsbeveiliging,
schorsen, het logboek).

> **Volledig end-to-end getest (2026-07-19)**, incl. **twee** tijdens
> testen gevonden en gefixte bugs, allebei dezelfde categorie fout: een
> permissie-check die de sessie-gebonden Supabase-client gebruikte voor
> een tabel (`admin_users`) die bewust nul client-grants heeft (zelfde
> "alleen service role"-precedent als `discount_codes`). Zo'n select
> geeft altijd `permission denied` (dus `data: null`) terug, ook voor een
> echte admin — waardoor (1) `middleware.ts`'s `/admin/*`-gate en (2) de
> gedeelde `requireAdmin()`-helper (gebruikt door **elke**
> `/api/admin/*`-route) allebei altijd "geen admin" concludeerden. Beide
> zijn gefixt door voor specifiek die lookup de service-role-client te
> gebruiken (`createServiceClient()`), terwijl de sessie-client blijft
> bepalen wíé er aanroept (`auth.getUser()`, dat kan de service role
> niet). Vóór de fix kon dus helemaal niet op het adminpanel worden
> ingelogd (gate 1) en gaf elke actie een 403 (gate 2) — na de fix
> bevestigd: een echte login, alle acties hieronder, en dat een klant/
> barber die naar `/admin` navigeert stil naar de eigen home gaat (geen
> foutmelding). Barber goedkeuren/schorsen bevestigd (incl. dat een
> geschorste barber bij de volgende navigatie naar `/geschorst` gaat,
> waar de bestaande matching-filter uit Fase 5 dat al voor nieuwe
> aanvragen deed maar nu ook de rest van `/barber/*` echt afsluit). Een
> geschil "terugbetalen aan klant" leverde een echte Stripe-refund op
> (`escrow_state → refunded`, `bookings.status` bevestigd ongewijzigd op
> `completed`). Kortingscode aanmaken + deactiveren bevestigd, direct
> zichtbaar voor Fase 9's `preview_discount_code`. Review verwijderen
> bevestigd, incl. de nieuwe `on_review_deleted`-trigger (0016) die
> `barber_profiles.rating_avg/rating_count` correct herberekende (null/0
> na de laatste review). Klant schorsen/herstellen bevestigd via een
> echte tweede sessie (`/geschorst` bij schorsing, gewoon toegang na
> herstellen). Het logboek bevatte na afloop een correcte, chronologische
> rij voor elke bovenstaande actie.

## Fase 9 — Wallet & Loyaliteit (afgerond)

Fase 0 t/m 8 zijn afgerond en end-to-end getest. Fase 9 bouwt een wallet
voor zowel klant als barber (opwaarderen + bonus, saldo, ledger-audit-
trail), loyaliteitspunten (alleen klant, verdienen bij een afgeronde
boeking + inwisselen naar saldo), een referral-systeem (unieke code per
profiel, €5/€5-bonus bij de eerste afgeronde boeking van de referee) en
kortingscodes (toepasbaar bij het afrekenen van een boeking). **Twee
bewuste scope-beslissingen, vooraf met de gebruiker afgestemd**: het
walletsaldo kan een boeking niet betalen (blijft losstaand van de
Stripe-betaalflow, om geen regressierisico te introduceren in de al
geteste escrow/refund/geschil-code uit Fase 6/7), en **abonnementen**
(wel in de oorspronkelijke roadmap-tekst) zijn volledig buiten deze fase
gehouden — een bewust uitgestelde toekomstige feature, geen gap. Zie
"Fase 9 — architectuur" hieronder voor de volledige toelichting
(ledger-patroon, welke bron welk bedrag bepaalt, de kortingscode-
correctie in de Stripe-webhook).

> **Volledig end-to-end getest (2026-07-19)**, incl. een tijdens testen
> gevonden en gefixte bug: de opwaardeer-notificatie gebruikte
> `to_char(..., 'FM999990.00')`, wat altijd een punt als decimaalteken
> geeft ("€100.00") — inconsistent met de rest van de Nederlandstalige UI
> (komma, zie `euro()` in `src/lib/pricing.ts`). Gefixt in
> `0015_fix_wallet_topup_notification_locale.sql`. Live bevestigd: een
> echte opwaardering van €100 (boven de bonusdrempel) leverde correct
> €100 + €10 bonus op (twee ledger-rijen, saldo 100→110), een €10-
> opwaardering (onder de drempel) leverde terecht geen bonus op. Een
> echte kortingscode (10%) op een echte boekingsbetaling verlaagde het
> daadwerkelijke Stripe-bedrag correct (€40,25 → €36,22), de
> `payments`-rij kreeg het juiste `discount_cents`/`amount_cents`, de
> barber-payout bleef ongewijzigd (platform absorbeert de korting), en
> een tweede poging met dezelfde code door dezelfde gebruiker werd
> terecht geweigerd ("Je hebt deze code al eens gebruikt"). Loyaliteits-
> punten: een afgeronde boeking van €35 leverde de klant 35 punten op en
> de barber terecht 0; inwisselen van 500 punten werkte (saldo +€5,00,
> punten -500), zowel de 500-punten-ondergrens als "onvoldoende punten"
> werden correct geweigerd. Referral: een tweede testaccount dat
> registreerde met de code van het eerste account kreeg `referred_by_id`
> correct gezet; na de eerste afgeronde boeking van de referee kregen
> beide accounts €5 (met notificaties), een tweede afgeronde boeking van
> dezelfde referee leverde terecht geen nieuwe bonus op (idempotent). Een
> RLS-steekproef bevestigde: de anon-rol heeft nul toegang tot
> `wallets`/`discount_codes`/`wallet_ledger_entries` (harde
> permission-denied, geen grants), en een ingelogde gebruiker kan het
> walletsaldo van een andere gebruiker niet lezen (lege resultaten).
> **Niet via de UI getest, wel via Stripe's API rechtstreeks bevestigd**:
> het daadwerkelijk klikken door Stripe's Payment Element-iframe (kaart-
> gegevens invoeren) bleek net als bij eerdere fases niet betrouwbaar te
> automatiseren in deze browser-testtool — de betalingen zelf zijn
> daarom bevestigd door de al aangemaakte PaymentIntents rechtstreeks via
> de Stripe API te confirmen (test-kaarttoken `pm_card_visa`), wat
> exact hetzelfde `payment_intent.succeeded`-webhookpad triggert als een
> echte UI-betaling.

## Fase 8 — Notificaties (afgerond)

Fase 0 t/m 7 zijn afgerond en end-to-end getest. Fase 8 koppelt de al
sinds Fase 2 bestaande `notifications`-tabel/enum (7 waarden, waarvan er
3 sinds Fase 5 gevuld werden) voor het eerst aan echte e-mail (Resend) en
push (Web Push/VAPID), en vult de resterende 4 types
(`new_request`/`payment_received`/`review_reminder`/`dispute`) voor het
eerst. Gebouwd op één centraal inzendpunt: elke bron blijft alleen een
rij in `notifications` inserten, één trigger op die tabel zelf regelt de
daadwerkelijke verzending — zelfde `app_config`/`CRON_SECRET`-patroon als
de escrow-vrijgave uit Fase 6. Voor het eerst kregen barbers ook een
eigen notificatiescherm (nodig om "geschillen" als roadmap-item correct
te kunnen bouwen — een barber had voorheen geen enkele zichtbaarheid op
een tegen hen geopend geschil). Zie "Fase 8 — architectuur" hieronder
voor de volledige toelichting.

> **Volledig end-to-end getest (2026-07-18)**, incl. een tijdens testen
> gevonden en gefixte bug: de Resend-SDK gooit geen exception bij een
> API-fout (bv. het test-domein-verzendlimiet) — die komt terug als een
> `{ error }`-veld in de respons, wat de verzendroute aanvankelijk niet
> controleerde en dus ten onrechte "verzonden" rapporteerde. Live
> bevestigd: een echte testbetaling zette zowel een `payment_received`-
> (klant) als `new_request`-rij (barber) neer, beide met een succesvol
> afgeleverde testmail (bevestigd via de Resend API, niet alleen op basis
> van de eigen "sent"-melding — precies dankzij het fixen van de hierboven
> genoemde bug). Een geopend geschil zette een `dispute`-notificatie voor
> de barber neer met de opgegeven reden. De review-herinnering-cron is
> getest met een teruggezette `completed_at` (zelfde techniek als de
> escrow-cron in Fase 6) — bevestigd zowel de aanmaak als de deduplicatie
> (een tweede aanroep maakt geen dubbele rij aan). Beide notificatie-
> schermen (`/klant/notificaties`, het nieuwe `/barber/notificaties`) en
> de barber-dashboard-bel zijn bevestigd correct te werken. De
> pushmeldingen-toggle laadt en bewaart de echte staat correct, maar een
> daadwerkelijk geslaagde push-inschrijving kon niet live bevestigd
> worden: deze specifieke browser-testomgeving heeft
> notificatietoestemming standaard al op "geweigerd" staan (geen
> promptbaar "default"-status meer) — bevestigd dat de code dit netjes
> afhandelt (geen crash, toggle blijft uit) i.p.v. de daadwerkelijke
> subscribe-flow te kunnen doorlopen. Genoteerd als vervolgpunt.

## Fase 7 — Reviews (afgerond)

Fase 0 t/m 6 zijn afgerond en end-to-end getest. Fase 7 koppelt de al
sinds Fase 2 bestaande `reviews`-tabel/RLS/rating-trigger (nooit
aangeroepen) aan echte UI: sterren + tekst achterlaten op een afgeronde
boeking, en de gemiddelde beoordeling die al sinds Fase 4 op `/klant/
barbers` getoond wordt, laat nu voor het eerst echte cijfers zien i.p.v.
overal "Nieuw op Groomy". Zie "Fase 7 — architectuur" hieronder voor de
volledige toelichting. De volledig decoratieve "Geef een fooi"-knop op het
oude mock-scherm is bewust verwijderd (met de gebruiker afgestemd) — geen
backend, niet in de roadmap-eis, en een knop die niets doet is misleidend.

> **Volledig end-to-end getest (2026-07-18)**: migratie `0012_reviews.sql`
> toegepast. `npm run build`/`npm run lint` schoon. Live bevestigd: een
> klant liet op een afgeronde boeking een 5-sterren-review met tekst
> achter → de `update_barber_rating`-trigger (Fase 2, voor het eerst
> aangeroepen) werkte de barber's `rating_avg`/`rating_count` meteen bij →
> zichtbaar op zowel `/barber/reviews` (met de echte reviewer-naam via de
> nieuwe `get_barber_reviews()`) als `/barber/profiel` (rating op twee
> plekken) als `/klant/barbers` (die laatste was al sinds Fase 4 bedraad,
> ging vanzelf echte cijfers tonen). De "al beoordeeld"-staat is bevestigd
> door terug te navigeren naar dezelfde boeking: het formulier maakt dan
> plaats voor een duidelijke melding, en de "Laat een review
> achter"-knop op `/klant/status` verdwijnt.

## Fase 6 — Stripe & Escrow (afgerond)

Fase 0 t/m 5 zijn afgerond en end-to-end getest. Fase 6 maakt betalen echt:
Stripe Connect (Express-accounts) voor barber-uitbetalingen, een echte
Payment Element-checkout, escrow via het "separate charges and
transfers"-patroon, een 24-uurs geschillenvenster dat de automatische
vrijgave blokkeert, en automatische volledige terugbetaling bij annuleren.
Dit sluit ook een sequencing-gat uit Fase 4/5: een boeking was voorheen al
zichtbaar/claimbaar voor barbers vóórdat er ooit betaald was — barber-
zichtbaarheid is nu RLS-matig gekoppeld aan een succesvolle betaling. Zie
"Fase 6 — architectuur" hieronder voor de volledige toelichting.

> **Volledig end-to-end getest (2026-07-18)**, incl. drie tijdens het
> testen gevonden en gefixte bugs (zie "Fase 6 — architectuur" voor
> details): een RLS-infinite-recursion tussen `bookings` en `payments`
> (migratie `0010`), een dubbele PaymentIntent door React 19's
> dubbel-uitvoerende dev-effects, en een crashende in plaats van per-
> boeking afgehandelde mislukte Stripe Transfer in de release-cron. Live
> bevestigd: een klant rondde een echte testbetaling af (Stripe Payment
> Element, test-kaart via de Stripe API bevestigd — het interactief
> invullen van Stripe's eigen betaalformulier bleek niet automatiseerbaar
> in de test-sandbox, zie hieronder) — de boeking werd pas ná de
> `payment_intent.succeeded`-webhook zichtbaar voor de barber, die hem
> accepteerde en de volledige rit (onderweg → aangekomen → bezig →
> afgerond) doorliep; `/barber/verdiensten` en `/barber/uitbetalingen`
> toonden meteen de echte bedragen (geen mock meer). Een tweede betaalde
> boeking is geannuleerd — bevestigd zowel in de database
> (`escrow_state='refunded'`) als in het Stripe-dashboard (een echte
> refund van het volledige bedrag). Een geschil geopend binnen het
> 24-uursvenster blokkeerde de automatische vrijgave (bevestigd met een
> handmatig teruggezette `completed_at` om niet op de klok te hoeven
> wachten); na resolutie probeerde de vrijgave-job een echte Stripe
> Transfer, die correct werd geweigerd omdat de barber de Connect-
> onboarding nog niet had afgerond — en dat werd nu netjes per boeking
> gerapporteerd i.p.v. de hele cron-run te laten crashen (de gefixte bug
> hierboven). De Stripe Connect **account-aanmaak en de Account
> Link-redirect** zijn bevestigd te werken (curl + browser), maar Stripe's
> eigen gehoste onboardingformulier zelf kon niet interactief ingevuld
> worden via de browser-testtool — vermoedelijk bewuste bot-weerstand op
> een KYC-formulier. Dat is Stripe's eigen, extern geteste product, niet
> mijn code; de delen die wél mijn verantwoordelijkheid zijn (account
> aanmaken, link genereren, de `account.updated`-webhook die
> `stripe_payouts_enabled` bijwerkt) zijn wel geverifieerd of grondig
> doorgenomen.

## Fase 5 — Matching (automatische toewijzing, afgerond)

Fase 0 t/m 4 zijn afgerond en end-to-end getest. Fase 5 voegt een tweede,
automatische weg toe naast de bestaande Fase 4-flow (klant kiest zelf een
barber, blijft ongewijzigd werken): een klant kan de aanvraag ook
automatisch laten toewijzen aan de dichtstbijzijnde geschikte barber
(binnen werkgebied, online, vandaag beschikbaar), met eerste-acceptatie-
wint en atomisch afgedwongen door de database. Zie "Fase 5 — architectuur"
hieronder voor de volledige toelichting.

> **Volledig end-to-end getest (2026-07-18)**: migratie `0007_matching.sql`
> is toegepast (`npx supabase db push`). `npm run build`/`npm run lint`
> schoon. Twee nieuwe testaccounts aangemaakt via de Supabase Admin API
> (client-side `signUp()` liep tegen de bekende gratis-mailquota-rate-limit
> aan — zie "Bekende gaps"). Live doorlopen: een barber zette werkgebied
> (geocoded via Nominatim) + ging online; een klant vroeg twee keer
> automatisch een barber aan (`find_nearest_eligible_barber` vond steeds
> de juiste barber op ~35 m afstand, met correcte prijs/duur-indicatie);
> de barber zag beide open aanvragen via `getOpenBroadcastRequestForBarber`
> en claimde ze via de atomische `claimBooking()` — beide keren correct
> bevestigd (status → `accepted`, `barber_id` correct gezet, direct
> zichtbaar op het barber-dashboard). De klant kreeg een echte
> `notifications`-rij ("Aanvraag bevestigd") via de nieuwe trigger. Het
> "geen barbers gevonden"-pad is bevestigd met een adres (Groningen) ver
> buiten het werkgebied: `find_nearest_eligible_barber` gaf een lege
> lijst, klant landde correct op `/klant/fout/nobarbers`. Ook bevestigd:
> een broadcast-aanvraag die verloopt (28s-timeout) of één keer niet
> geclaimd kan worden, blijft gewoon open voor andere barbers (geen
> ongewenste annulering) — zichtbaar doordat de "Nieuwe aanvraag"-banner
> op het dashboard bleef staan. **Niet met een echte tweede, gelijktijdige
> claim-poging getest**: een geconstrueerde race via twee parallelle
> `fetch`-calls liep vast op een sterk verlopen sessie-JWT, een artefact
> van de sterk versnelde/springende klok in deze specifieke test-sandbox
> tijdens een lange sessie — geen appfout. De atomische garantie zelf
> (`update ... where barber_id is null and status = 'requested'`,
> gecombineerd met de expliciete `with check` op de RLS-policy, zie
> "Fase 5 — architectuur") is bij het schrijven van `0007` al zorgvuldig
> tegen precies dit scenario doorgenomen; een echte gelijktijdige test met
> twee losse browsersessies is een goed vervolgpunt zodra dat praktischer
> uit te voeren is.

> **Volledig end-to-end getest (2026-07-18)**: een klant heeft een echte
> barber geboekt (dienst/adres/opmerking), de barber heeft geaccepteerd en
> stap voor stap door en_route → arrived → in_progress → completed
> geklikt — de klant zag elke statuswijziging live verschijnen (polling,
> geen page-reload nodig). Een tweede boeking is geannuleerd via de echte
> annuleer-flow. Een directe API-poging om een afgeronde boeking terug
> naar "requested" te zetten werd door de nieuwe database-trigger
> geblokkeerd met precies de verwachte foutmelding. Tijdens het testen
> zijn twee bugs gevonden en meteen gefixt: (1) de `approved_barbers`-view
> was standaard ook voor niet-ingelogde bezoekers leesbaar (Postgres'
> default-privileges gelden ook voor views, niet alleen tabellen) —
> gecorrigeerd in `0006_lock_down_approved_barbers_view.sql`; (2) de
> servicetag "Baard" op de home-pagina matchte niet met de echte
> servicenaam "Baard trimmen", waardoor de verkeerde dienst werd gekozen.

> **Volledig end-to-end getest (2026-07-17)**: alle vier migraties staan op
> het Supabase-project (via `npx supabase db push`, 9 tabellen + 2
> Storage-buckets geverifieerd). Daarna is de hele app doorlopen met twee
> echte testaccounts (klant + barber): registratie, e-mailbevestiging
> (handmatig via `auth.users.email_confirmed_at` — dashboard had geen
> directe "confirm"-knop in deze Supabase-versie), inloggen, rol-scheiding
> in beide richtingen, uitloggen — allemaal bevestigd werkend. De volledige
> barber-aanmeldflow inclusief 4 **echte bestandsuploads** naar Storage
> (ID-bewijs, 3 portfoliofoto's, verzekering, diploma) is doorlopen en
> geverifieerd; `/barber/werkgebied` en `/barber/beschikbaarheid` zijn
> getest met een page-reload om echte persistentie (niet alleen lokale
> state) te bevestigen. Wachtwoord-vergeten kon niet volledig getest worden
> (Supabase's gratis mailquota opnieuw geraakt tijdens testen) — de
> foutafhandeling zelf werkt wel aantoonbaar correct.
>
> **Tijdens testen gevonden en gefixt**: de dagvolgorde op
> `/barber/beschikbaarheid` sprong na de eerste keer opslaan van
> chronologisch (Ma-Zo) naar alfabetisch, omdat Postgres JSONB geen
> sleutelvolgorde garandeert. Opgelost met een vaste `DAY_ORDER`-array
> i.p.v. `Object.keys()`.

## Techstack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 3 — design tokens 1:1 overgenomen uit
  `design_handoff_groomy_mvp/tokens/*.css` (zie `tailwind.config.ts`)
- lucide-react voor iconen (vervangt de CDN-Lucide uit de prototypes)
- Inter via `next/font/google`
- **Supabase Auth** (`@supabase/supabase-js` + `@supabase/ssr`) — e-mail/
  wachtwoord-authenticatie, rollen via `user_metadata` + een `profiles`-tabel
  met Row Level Security
- **Supabase CLI** (devDependency, via `npx supabase ...`) — migraties
  pushen naar het gekoppelde project (`supabase/migrations/`)

## Starten

```bash
npm install
cp .env.local.example .env.local   # vul NEXT_PUBLIC_SUPABASE_URL + ANON_KEY in
npm run dev
```

Open http://localhost:3000 (of de poort die de terminal toont — poort 3000
kan al bezet zijn door een ander lokaal proces) — je krijgt een keuze tussen
de klant-app en de barber-app. Op desktop wordt de UI getoond binnen een
telefoonframe (390×844), zoals in de originele designs.

### Supabase-project koppelen (eenmalig)

1. Maak een project aan op supabase.com/dashboard.
2. Kopieer Project URL + anon key (Project Settings → API) naar `.env.local`.
3. Migraties toepassen via de **Supabase CLI** (`supabase` staat als
   devDependency in `package.json`, draai via `npx supabase ...` — geen
   losse installatie nodig):
   ```bash
   npx supabase login                              # opent een browser-login, eenmalig
   npx supabase link --project-ref <jouw-project-ref>   # te vinden in de project-URL/dashboard
   npx supabase db push                            # past alle migraties in supabase/migrations/ toe, in volgorde
   ```
   `link` vraagt om je database-wachtwoord (ingesteld bij het aanmaken van
   het project; te resetten via Project Settings → Database als je het
   kwijt bent). Alternatief zonder CLI: plak de inhoud van elk bestand in
   `supabase/migrations/` **in bestandsvolgorde** (0001 → 0006) in de
   Supabase SQL Editor en voer ze één voor één uit.
   - `0001_init_profiles.sql` — `profiles`-tabel, rollen-enums,
     RLS-policies, signup-trigger.
   - `0002_barber_status_suspended.sql` — voegt `suspended` toe aan
     `barber_status`.
   - `0003_booking_system_schema.sql` — het volledige boekingensysteem-
     schema (barber/customer-profielen, services, bookings, payments,
     reviews, disputes, notifications).
   - `0004_barber_verification.sql` — profielfoto/diploma/beschikbaarheid-
     kolommen + de `barber-media`- en `barber-documents`-Storage-buckets
     met RLS.
   - `0005_booking_status_machine.sql` — dwingt geldige boekingsstatus-
     overgangen af, plus `approved_barbers`-view en
     `get_booking_customer_name()` zodat klant en barber elkaars naam
     kunnen zien bij een boeking.
   - `0006_lock_down_approved_barbers_view.sql` — sluit anoniem leestoegang
     tot de `approved_barbers`-view af (gevonden tijdens Fase 4-testen).
   - `0007_matching.sql` — lat/lng + online-status, `haversine_km()`,
     broadcast/claim-RLS-policies op `bookings`, uitbreiding van de
     statusovergang-trigger met de claim-tak, klant-notificatie-trigger.
4. Authentication → URL Configuration: zet Site URL en Redirect URLs op je
   lokale dev-URL (bv. `http://localhost:3001/**`).
5. Controleer dat de "Confirm signup"- en "Reset password"-mailtemplates het
   `token_hash`/`type`-linkformaat gebruiken:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}`
   (standaard in recente Supabase-projecten).

**Nieuwe migratie toevoegen**: bestand aanmaken in `supabase/migrations/`
met een oplopend nummer (`0005_...sql`), dan opnieuw `npx supabase db push`
— de CLI houdt zelf bij welke migraties al toegepast zijn (in een
`supabase_migrations`-schema op de remote database) en past alleen nieuwe
toe.

## Mappenstructuur

```
src/
  app/
    page.tsx                 → app-kiezer (klant/barber), alleen voor lokale dev
    api/
      geocode/route.ts       → proxyt server-side naar Nominatim (nooit rechtstreeks
                                vanuit de client, zie Fase 5-architectuur)
      stripe/
        create-payment-intent/route.ts → berekent bedrag server-side, maakt PaymentIntent
        webhook/route.ts               → payment_intent.succeeded/account.updated (service role)
        connect-onboarding/route.ts    → Express-account + Account Link voor barbers
        cancel-and-refund/route.ts     → annuleren + automatische volledige refund
      cron/
        release-escrow/route.ts        → CRON_SECRET-beveiligd, automatische escrow-vrijgave
    auth/
      confirm/route.ts       → verwerkt bevestigings-/reset-links (verifyOtp)
      error/page.tsx         → generieke foutpagina voor verlopen/ongeldige links
    klant/                   → klant-app, met eigen layout.tsx (tab bar + phone shell)
      onboarding/ login/ register/ bevestig-email/
      wachtwoord-vergeten/ wachtwoord-instellen/
      home/ barbers/ boeking/ betaling/ succes/ status/ review/
      annuleren/ geannuleerd/ notificaties/ instellingen/ profiel/
      geschil/                → geschil openen binnen 24u na completed (Fase 6)
      fout/[kind]/           → foutstaten (geen barbers/betaling mislukt/offline)
    barber/                  → barber-app, met eigen layout.tsx
      login/ register/ bevestig-email/
      wachtwoord-vergeten/ wachtwoord-instellen/
      aanmelden/ in-behandeling/ dashboard/ aanvraag/ rit/
      verdiensten/ uitbetalingen/ beschikbaarheid/ werkgebied/ reviews/
      profiel/ geannuleerd-door-klant/ leeg/[kind]/
  components/
    ui/        → 16 designsysteem-primitives (Button, Input, Dialog, TabBar, ...)
    shared/    → Avatar, Row, EmptyState, SectionLabel, EscrowDot, UploadTile, PhoneShell
  lib/
    types.ts       → Booking, Barber, Payout, EscrowState, UserRole, Profile,
                      BarberProfile, CustomerProfile, Availability,
                      BarberListItem, BookingRecord (echte Fase 4-types), enz.
    mock-data.ts    → nog gebruikt voor enkele decoratieve velden (bv. "412
                      boekingen" op barber/profiel) — boekingen (Fase 4),
                      verdiensten/uitbetalingen (Fase 6) en reviews (Fase 7)
                      zijn zelf niet meer mock
    pricing.ts      → computePriceBreakdown() — enige bron van waarheid voor de
                      15%-servicekosten-berekening, ook gebruikt door
                      create-payment-intent (Fase 6)
    stripe.ts       → server-only Stripe SDK-client (getStripe(), lazy) (Fase 6)
    stripe-client.ts → browser-only Stripe.js-loader voor de Payment Element (Fase 6)
    supabase/
      client.ts     → browser Supabase-client
      server.ts     → server Supabase-client (Server Components/Route Handlers)
      service.ts    → service-role Supabase-client — omzeilt RLS, uitsluitend in
                      Route Handlers zonder (juiste) gebruikerssessie (Fase 6)
      middleware.ts → ververst de sessiecookie per request
      queries.ts    → getProfile()/getBarberProfile()/getCustomerProfile(),
                      getApprovedBarbersWithServices(), createBooking(),
                      updateBookingStatus(), getBooking(),
                      getActiveBookingForCustomer/Barber(),
                      getPendingRequestForBarber(), getRecentBookingsForBarber(),
                      getBookingCustomerName(), rol → home/login-route-mapping,
                      geocodeAddress(), setBarberLocation(), setBarberOnline(),
                      findNearestEligibleBarber(), getOpenBroadcastRequestForBarber(),
                      claimBooking(), getNotificationsForCustomer(),
                      markNotificationRead() (Fase 5), openDispute(), getPayment(),
                      getPaymentsForBarber() (Fase 6)
      errors.ts     → Supabase-foutmeldingen → Nederlandse copy
      storage.ts    → uploadBarberFile() — upload naar barber-media/barber-documents
  middleware.ts     → auth + rol-gating voor alle /klant/* en /barber/* routes
supabase/
  migrations/
    0001_init_profiles.sql              → profiles-tabel, RLS, trigger
    0002_barber_status_suspended.sql    → voegt "suspended" toe aan barber_status
    0003_booking_system_schema.sql      → barber/customer_profiles, services,
                                           bookings, payments, reviews,
                                           disputes, notifications (RLS, indexes)
    0004_barber_verification.sql        → avatar/diploma/availability-kolommen,
                                           barber-media + barber-documents Storage-
                                           buckets met RLS
    0005_booking_status_machine.sql     → statusovergang-trigger, approved_barbers-
                                           view, get_booking_customer_name()
    0006_lock_down_approved_barbers_view.sql → anon-toegang tot de view afgesloten
    0007_matching.sql                   → lat/lng + is_online, haversine_km(),
                                           broadcast/claim-RLS, notificatie-trigger
    0009_stripe_escrow.sql              → Stripe-kolommen, completed_at, betaal-
                                           gated barber-zichtbaarheid, 24u-geschillen-
                                           policy (0008 bestaat niet, zie migratie-comment)
    0010_fix_bookings_payments_rls_recursion.sql → booking_has_payment()-fix voor
                                           de RLS-recursie tussen bookings/payments
```

## Ontwerpkeuzes t.o.v. het design-pakket

- **Routestructuur**: het handoffpakket stelde route groups `(customer)` /
  `(barber)` voor (geen URL-prefix). Ik heb gekozen voor expliciete
  `/klant/...` en `/barber/...` prefixes — makkelijker te navigeren zonder
  auth, en voorkomt naamsconflicten tussen beide apps in één Next-project.
- **"Boekingen"-tab (klant)**: in het originele prototype bestond geen
  aparte boekingenoverzicht-schermen; de tab wees naar het barberslijst-
  scherm. Dat is hier hetzelfde — een echt boekingenoverzicht ontbreekt nog
  en is werk voor een latere fase (boekingensysteem).
- **Icoon-substitutie**: Lucide-iconen zijn 1-op-1 gemapt op de originele
  Lucide-namen uit de prototypes (bv. `Icons.doc` → `FileText`).
- **Telefoonframe**: op desktop toont de app een vast 390×844-frame
  (`PhoneShell`), zodat de pixel-perfecte iOS-viewport uit de designs behouden
  blijft; op mobiel vult de app het volledige scherm.
- **Barber-registratie**: het design-pakket had alleen een uitgebreide
  "Word Groomy-barber"-flow (`/barber/aanmelden`: KvK, verificatie,
  diensten), geen losse login/register-schermen. Die zijn nu toegevoegd
  (`/barber/login`, `/barber/register`), gespiegeld op de klant-versie;
  `aanmelden` is de profiel-onboarding die direct na registratie volgt.
- **OAuth-knoppen** (Apple/Google op de loginschermen) staan nog in de UI
  maar zijn verborgen achter `OAUTH_ENABLED = false` in beide login-pagina's
  — geen echte OAuth-flow in deze fase, bewust niet verwijderd zodat ze met
  één regel weer aan te zetten zijn.

## Fase 1 — architectuur (authenticatie)

- **Rollen-opslag**: een `profiles`-tabel (1:1 met `auth.users`, RLS aan).
  De rol (`customer`/`barber`) wordt meegegeven als `user_metadata` bij
  `signUp()` en door een Postgres-trigger (`handle_new_user`, security
  definer) gekopieerd naar de `profiles`-rij. Route-protectie in
  `src/middleware.ts` leest de rol uit `user_metadata` (al in het JWT via
  `getUser()`) — **geen database-roundtrip per request**.
- **Kolom-niveau lockdown**: de RLS-policy staat toe dat een gebruiker zijn
  eigen rij update, maar zonder extra maatregel zou dat óók `role` en
  `barber_status` omvatten (self-promotion tot barber, of jezelf
  "approved" zetten). De migratie revoked daarom eerst alle rechten en
  grant expliciet alleen `select` plus `update` op `full_name`, `phone`,
  `onboarding_completed` aan `authenticated` — `role`/`barber_status` zijn
  alleen door de trigger (of later een admin-rol) te zetten.
- **Route-protectie**: uitsluitend in `src/middleware.ts`, geen losse guards
  per pagina. Geen sessie of verkeerde rol op een `/klant/*`- of
  `/barber/*`-route → redirect naar de eigen-rol login resp. eigen home.
  Publieke routes (login/register/onboarding/wachtwoord-schermen/
  foutpagina's) zijn altijd bereikbaar; een al ingelogde gebruiker wordt van
  login/register/root weg-geredirect naar zijn eigen home.
- **E-maillinks** (bevestiging + wachtwoord-herstel): één gedeelde Route
  Handler `src/app/auth/confirm/route.ts` verifieert `token_hash`+`type`
  server-side (`verifyOtp`, zet de sessiecookie) en stuurt door op basis van
  `type` en de rol uit `user_metadata` — geen implicit-flow/hash-parsing in
  de client. Ongeldige/verlopen links landen op `/auth/error`.
- **Barber-onboarding scope**: `/barber/aanmelden` (KvK, verificatie-
  uploads, diensten) blijft een **UI-flow met lokale state**, zoals in
  Fase 0 — dat wordt pas echt opgeslagen wanneer barber-profielen/het
  boekingensysteem gebouwd worden. Fase 1 voegt er precies één ding aan
  toe: bij versturen wordt `profiles.onboarding_completed = true` gezet,
  zodat een barber bij een volgende login niet opnieuw naar `aanmelden`
  wordt gestuurd.
- **Mock data**: blijft ongewijzigd voor boekingen/verdiensten/reviews
  (`src/lib/mock-data.ts`). Alleen de naam/e-mail-weergave op de twee
  `profiel`-pagina's komt nu uit de echte sessie i.p.v. `CURRENT_CUSTOMER`/
  `CURRENT_BARBER`.

## Barber-verificatiestatus — architectuur-voorbereiding (geen adminpanel nog)

Beslissing (2026-07-17): `barber_status` blijft de basis voor het
toekomstige goedkeuringsproces van barbers. Fase 1 bouwt **geen** adminpanel
en **geen** goedkeuringsflow — alleen het datamodel is al klaar zodat een
latere fase dit zonder refactor kan toevoegen.

**De vier statussen** (enum `public.barber_status`, kolom
`profiles.barber_status`, alleen relevant voor `role = 'barber'`):

| Status      | Betekenis                                                                 |
|-------------|----------------------------------------------------------------------------|
| `pending`   | Wacht op beoordeling. Standaard direct na registratie (gezet door de trigger in `0001_init_profiles.sql`). |
| `approved`  | Geverifieerd door Groomy. Enige status die straks zichtbaar mag zijn voor klanten en boekingen mag accepteren. |
| `rejected`  | Aanmelding afgewezen. Geen toegang tot boekingen.                         |
| `suspended` | Tijdelijk geblokkeerd door Groomy (bv. na klachten of fraude), ook al was de barber eerder `approved`. Geen toegang tot boekingen tot een admin de status weer terugzet. |

**Wat straks (bij het bouwen van het adminpanel/goedkeuringsflow) nog moet
gebeuren** — bewust nog niet gebouwd in Fase 1:
- Zichtbaarheid in de klant-app (barberslijst/matching) filteren op
  `barber_status = 'approved'`.
- Voor `pending`/`rejected`/`suspended`: een duidelijk scherm voor de barber
  zelf met uitleg waarom die geen opdrachten kan ontvangen en wat de
  vervolgstappen zijn (bv. "we beoordelen je aanmelding nog", "je aanmelding
  is afgewezen, neem contact op", "je account is geschorst, neem contact
  op"). Nog geen kant-en-klare copy/schermen hiervoor — komt met de flow
  zelf, zodat de exacte vervolgstappen (contact-flow, bezwaar aantekenen,
  etc.) in één keer goed ontworpen worden i.p.v. nu alvast half.
- Een admin-rol/adminpanel dat `barber_status` kan wijzigen.

**Waarom dit nu al zonder refactor kan** (de voorbereiding die wél al klaar
staat):
- Het datamodel is compleet: alle vier statussen bestaan al in de enum
  (`0002_barber_status_suspended.sql`), inclusief SQL-commentaar met de
  betekenis van elke status op de kolom zelf.
- `authenticated` heeft **geen** update-recht op `barber_status` (zie
  kolom-grants in `0001_init_profiles.sql`) — een admin-pad zal dus sowieso
  via een server-side Route Handler met de Supabase **service role key**
  moeten lopen (nooit clientside), wat toch de juiste/veilige aanpak is voor
  een adminpanel. Er hoeft dus niets "losgetrokken" te worden van client-side
  code.
- `Profile`/`BarberStatus` (`src/lib/types.ts`) en `getProfile()`
  (`src/lib/supabase/queries.ts`) geven `barberStatus` al mee — een
  toekomstige gating-check (in middleware, een layout, of een
  matching-query) heeft dus meteen een typed veld om op te filteren, zonder
  het datamodel opnieuw te hoeven optuigen.

## Fase 2 — architectuur (database)

- **`profiles` = de "Users"-tabel, twee nieuwe 1:1-extensietabellen erbij.**
  De roadmap noemt "Users, Barber Profiles, Customer Profiles" als losse
  tabellen; in plaats van de bestaande `profiles`-tabel (met de al werkende
  auth-RLS/grants/trigger uit Fase 1) te herschrijven, zijn
  `barber_profiles` en `customer_profiles` puur additief toegevoegd
  (`id references profiles(id)`). Geen enkele wijziging aan wat Fase 1
  bouwde — de signup-trigger (`handle_new_user`) is uitgebreid via
  `create or replace function` (niet-destructief) zodat die nu ook meteen
  de juiste extensierij aanmaakt op basis van de rol.
- **Geldbedragen als integer cents** (`price_cents`, `amount_cents`, ...),
  nooit float — voorkomt afrondingsfouten. Fase 4 rekent dit om bij het
  tonen; de huidige mock data gebruikt nog gehele euro's.
- **Snapshot-velden op `bookings`** (`service_name_snapshot`,
  `price_cents_snapshot`, `duration_minutes_snapshot`): een boeking bevat
  een kopie van de dienstgegevens op het moment van boeken, zodat een
  latere wijziging of verwijdering van een `service`-rij oude boekingen
  niet stilletjes verandert.
- **`payments` heeft geen enkel client-schrijfrecht** (geen insert/update-
  grant voor `authenticated`, alleen `select` op de eigen boeking) — alleen
  een toekomstige service-role/Stripe-webhook (Fase 6) mag hier ooit in
  schrijven. Zelfde aanpak voor de resolutie-velden van `disputes`
  (`status`, `resolution_notes`, `resolved_at`): geen update-grant, dus
  alleen server-side/admin te wijzigen — consistent met hoe `barber_status`
  in Fase 1 al was afgeschermd.
- **RLS-recursion opgelost met een `security definer`-helper**: barbers
  moeten door klanten te vinden zijn (`barber_profiles`/`services` zichtbaar
  als `barber_status = 'approved'`), maar een RLS-policy die daarvoor
  rechtstreeks tegen `profiles` subquery't zou altijd leeg terugkomen —
  die subquery is zelf óók onderhevig aan de "alleen je eigen rij"-policy
  van `profiles` uit Fase 1. Opgelost met `public.is_approved_barber(id)`,
  een `security definer`-functie die alleen een boolean teruggeeft (nooit
  de onderliggende rij, dus geen lek van e-mail/telefoon van andere
  gebruikers). Dit is meteen de eerste concrete stap richting "alleen
  approved barbers zichtbaar voor klanten" — nog niet gebruikt in de UI
  (geen matching/browse-feature gebouwd in Fase 2), maar de RLS staat er al
  correct voor klaar.
- **Booking-statusovergangen niet afgedwongen in de database.** Zowel
  klant als barber hebben een update-grant op `bookings.status` (nodig,
  want beide zijden veranderen de status op verschillende momenten in de
  flow). Er is nog geen constraint/trigger die een ongeldige overgang (bv.
  een klant die zelf naar `completed` zet) tegenhoudt — dat hoort bij
  Fase 4, waar de echte state machine gebouwd wordt.
- **Rating is gecached, niet live geaggregeerd**: `barber_profiles.rating_avg`/
  `rating_count` worden bijgewerkt door een trigger op `reviews`-inserts
  (`update_barber_rating`), zodat een barberslijst niet bij elke read een
  aggregatie over alle reviews hoeft te draaien.

## Fase 3 — architectuur (barber-verificatie)

- **`/barber/aanmelden` is nu écht gekoppeld aan Supabase**: bij het laden
  worden bestaande `profiles`/`barber_profiles`/`services`-gegevens
  opgehaald en vooringevuld (zodat een barber die halverwege stopt niet
  opnieuw hoeft te beginnen); bij "Verstuur aanmelding" worden naam/
  telefoon (`profiles`), KvK/stad/documenten/portfolio
  (`barber_profiles`) en de 3 diensten (`services`, eerst verwijderd dan
  opnieuw ingevoegd — er is geen natuurlijke unique-constraint voor een
  upsert) in één moeite weggeschreven, samen met de bestaande
  `onboarding_completed = true`.
- **Twee Storage-buckets**: `barber-media` (publiek — avatar/portfolio,
  moet later door klanten bekeken kunnen worden) en `barber-documents`
  (privé — ID-bewijs/verzekering/diploma, nooit publiek). Beide met RLS op
  `storage.objects` gescopet op het eerste pad-segment (`{userId}/...`) =
  `auth.uid()`. Voor de privé-bucket bevatten de kolommen
  (`id_doc_url`/`insurance_doc_url`/`diploma_url`) het **storage-pad**, geen
  publieke URL — die zou toch niet werken op een privé-bucket. Er is geen
  scherm dat deze documenten ooit toont, dus geen signed-URL-logica nodig
  in Fase 3.
- **Nieuwe "Verzekering"-uploadtegel** toegevoegd aan stap "Verificatie" —
  stond niet in het originele design-pakket (dat had alleen
  Identiteitsbewijs/Portfolio/Diploma), maar was een expliciete eis in de
  Fase 3-roadmap. `insurance_doc_url` bestond al sinds Fase 2 maar werd
  door geen enkele UI-tegel gebruikt.
- **`availability` als simpele JSONB dag-map**, geen aparte tabel — de
  bestaande UI laat alleen per dag aan/uit togglen (geen tijdvakken), dus
  een relationele tabel met start/eindtijden zou nu ongebruikte
  complexiteit zijn. Als de UI ooit tijdvakken per dag aanbiedt, is dat een
  nieuwe additieve migratie, geen refactor van dit veld.
- **`/barber/in-behandeling` toont nu de echte `barber_status`**: pending
  (bestaande copy), rejected en suspended krijgen eigen copy met een
  contact-verwijzing; approved stuurt automatisch door naar
  `/barber/dashboard`. **Scope-grens**: dit scherm laat alleen de eigen
  status zíen — het daadwerkelijk kunnen wijzigen van die status
  (goedkeuren/afwijzen/schorsen) blijft bij Fase 10 (Admin Dashboard),
  zoals eerder afgesproken.
- **`/barber/werkgebied` en `/barber/beschikbaarheid`** zijn simpele
  load/save-schermen geworden tegen `barber_profiles.work_area_km` resp.
  `.availability` — geen nieuwe patronen t.o.v. de rest van de codebase.

## Fase 4 — architectuur (boekingen)

- **Statusmachine als database-trigger** (`check_booking_status_transition`,
  `0005`), niet alleen in de UI: elke overgang wordt gecontroleerd op
  (a) een toegestane stap in `requested → accepted → en_route → arrived →
  in_progress → completed`, met `cancelled` als escape-hatch vanaf
  requested/accepted/en_route, en (b) of de juiste partij de overgang
  maakt (customer mag alleen annuleren, barber mag de rest). Live getest:
  een directe API-call die een afgeronde boeking terugzet naar
  `requested` werd geblokkeerd met exact de verwachte foutmelding — dit
  werkt dus ook als iemand de UI omzeilt.
- **Klant kiest zelf een barber** (geen automatische matching) — bewuste
  keuze, matcht het bestaande design; Fase 5 ("Matching") beslist later of/
  hoe dit wordt aangevuld met automatische toewijzing.
- **`approved_barbers`-view en `get_booking_customer_name()`-functie**:
  zelfde `security definer`-patroon als `is_approved_barber()` uit Fase 2
  (zie regel 10 in `CLAUDE.md`) — laat een klant de naam van een approved
  barber zien, en een barber de naam van zijn eigen klant, zonder de RLS
  van `profiles` te verruimen. **Gevonden tijdens testen**: Postgres'
  default-privileges op het `public`-schema gelden ook voor views (niet
  alleen tabellen) — `approved_barbers` was daardoor ook voor anonieme
  bezoekers leesbaar. Gecorrigeerd in `0006`.
- **Cross-scherm state via query-params** (`?service=`, `?barberId=`,
  `?serviceId=`, `?bookingId=`) — er was nog geen enkel voorbeeld hiervan
  behalve `?done=1` op verdiensten; nu het patroon voor de hele
  boekingsflow. Geen nieuwe state-management-library nodig.
- **`/klant/status` gebruikt polling** (elke 4s), geen Supabase Realtime-
  subscriptie — bewust, want "live"/"push" hoort explicieter bij Fase 5/8.
  Live bevestigd: alle statuswijzigingen van de barber-kant kwamen zonder
  page-reload door op de klant-statuspagina.
- **UI-toevoegingen t.o.v. het design** (zelfde precedent als de
  "Verzekering"-tegel in Fase 3): `/klant/boeking` kreeg een echt
  bewerkbaar adresveld, een opmerkingveld, en datum/tijd-inputs die
  verschijnen zodra "Gepland" gekozen is — de bestaande maar tot nu toe
  dode "Nu"/"Gepland"-tabs op `/klant/barbers` sturen dit nu echt aan.
  ETA/afstand op de barberslijst ("12 min", "2,4 km") zijn vervangen door
  "Beschikbaar" — er is geen locatie-/matchinglogica om die getallen op te
  baseren (Fase 5), dus geen verzonnen precisie tonen.
- **Betaling blijft decoratief**: `/klant/betaling` toont nu het echte
  bedrag (dienstprijs + 15%) maar schrijft niets naar `payments` — die
  tabel blijft leeg tot Fase 6 (Stripe & Escrow) er echt op schrijft.
- **Gevonden tijdens testen**: de servicetag "Baard" op `/klant/home`
  matchte niet met de echte servicenaam "Baard trimmen" (die barbers bij
  aanmelden krijgen), waardoor de verkeerde dienst geselecteerd werd —
  gecorrigeerd door de tag-namen exact te laten matchen.

## Fase 5 — architectuur (matching)

- **Geocoding: gratis Nominatim/OpenStreetMap, geen API-key.** Server-side
  geproxyt via `src/app/api/geocode/route.ts` (correcte User-Agent, nooit
  rechtstreeks vanuit de client — vereist door Nominatim's gebruiks-
  voorwaarden). **Bewust afgewogen tegen Mapbox/Google Geocoding**: die
  bieden hogere nauwkeurigheid/rate-limits maar kosten een API-key en
  (bij schaal) geld; met de gebruiker afgestemd om nu voor de gratis optie
  te gaan en Mapbox/Google genoteerd te houden als upgrade-pad — relevant
  zodra Fase 5 een echte live kaart krijgt (zie "Openstaande beslissingen"
  hieronder).
- **`haversine_km()` in platte SQL**, geen PostGIS-extensie — op
  stad-schaal matching is de nauwkeurigheidswinst van PostGIS niet nodig
  en het voorkomt een extra Postgres-extensie-afhankelijkheid.
- **Broadcast + eerste-acceptatie-wint**: een automatisch-toegewezen
  boeking wordt aangemaakt met `barber_id = null`. Twee nieuwe RLS-
  policies op `bookings` laten een barber zo'n openstaande aanvraag alleen
  zien/claimen als die zelf binnen de Haversine-afstand valt én de
  gevraagde dienst aanbiedt — geen bredere zichtbaarheid van klantadres/
  opmerking dan strikt nodig. Claimen is een **atomische conditionele
  update** (`update ... where barber_id is null and status = 'requested'`);
  0 geraakte rijen = een andere barber was eerder, de UI toont dan "Deze
  aanvraag is al vergeven" in plaats van door te sturen naar de rit-flow.
  Dit is de databaseniveau-afdwinging van "overige aanvragen sluiten
  automatisch" uit de oorspronkelijke eis, niet client-side timing.
- **`check_booking_status_transition` uitgebreid** met een expliciete
  claim-tak (`old.barber_id is null and new.barber_id = auth.uid() and
  requested → accepted`) vóór de bestaande Fase 4-actorlogica, en de
  trigger-WHEN-clause is verbreed zodat een `barber_id`-wijziging zónder
  gelijktijdige statuswijziging ook gevalideerd wordt (dat gat bestond
  voorheen niet, omdat `barber_id` in Fase 4 nooit veranderde na de
  insert).
- **`barber_profiles.is_online`** vervangt de losse React-`useState` die
  sinds Fase 4 al op `/barber/dashboard` stond maar nergens naar
  wegschreef — nu echt persistent, en de basis voor de "alleen
  beschikbare barbers"-eis. Beschikbaarheid voor een broadcast-aanvraag =
  online **en** vandaag `true` in `availability` (Fase 3) **en** binnen
  straal **en** biedt de dienst aan; de dag/tijd-check zit in een
  `security definer`-functie (`barber_is_online_and_available()`),
  hergebruikt door zowel de RLS-policies als `find_nearest_eligible_barber`
  in plaats van drieluik-duplicatie.
- **`find_nearest_eligible_barber()` geeft bewust geen naam/coördinaten
  terug** — alleen `barber_id`/`service_id`/prijs/duur/afstand, genoeg om
  een prijsindicatie te tonen vóór een klant bevestigt. Degene die
  uiteindelijk claimt voert de klus uit tegen deze getoonde prijs (alle
  barbers bieden dezelfde 3 standaarddiensten uit `barber/aanmelden` aan,
  dus prijzen liggen in de praktijk dicht bij elkaar) — een bewuste
  MVP-vereenvoudiging, geen eigen-prijs-override bij het claimen.
- **Klant-notificaties via een nieuwe `after update`-trigger**
  (`notify_customer_on_status_change`) — dit is precies het
  "backend-logica"-insertpad dat de `notifications`-tabel sinds Fase 2 al
  aankondigde in haar table-comment (geen client-insert-grant, nu voor het
  eerst een schrijver). **Scope-grens**: alleen bij `accepted`/`en_route`/
  `arrived`, alleen richting de klant — geen `completed`/`cancelled`-
  notificaties en geen barber-notificaties in deze fase (barbers zien
  nieuwe aanvragen al via bestaande dashboard-polling). `/klant/
  notificaties` is nu echt gewired (was 100% mock): leest eigen rijen,
  markeert ze als gelezen bij het openen van het scherm.
- **Klant-flow: een nieuwe weg naast de bestaande, niet erover heen.**
  `/klant/barbers` kreeg een "Snelste beschikbare barber"-kaart (hergebruikt
  de al bestaande maar tot nu toe decoratieve "Snelste"-badge) die naar
  `/klant/boeking` navigeert met `?service=...&auto=1` (geen `barberId`/
  `serviceId`). `/klant/boeking` herkent `auto=1`: de bestaande
  barberId-vereiste redirect-guard geldt dan niet, en bij "Bevestig
  aanvraag" wordt eerst het adres gegeocode en de dichtstbijzijnde
  geschikte barber gezocht (vóór de bevestigings-dialoog opent, zodat de
  klant de prijsindicatie ziet voordat die akkoord geeft) — geen match
  → `/klant/fout/nobarbers` (bestond al als ongebruikt scherm, nu voor het
  eerst echt bereikt). De bestaande handmatige lijst blijft ongewijzigd
  werken voor wie zelf wil kiezen.
- **`/barber/aanvraag` onderscheidt twee "modi"**: een rechtstreeks-
  toegewezen aanvraag (Fase 4, `getPendingRequestForBarber`) en een open
  broadcast-aanvraag (Fase 5, `getOpenBroadcastRequestForBarber`) — een
  barber ziet het eerste van beide dat van toepassing is. Voor een
  broadcast-aanvraag doet "Accepteer" de atomische `claimBooking()`
  i.p.v. de simpele statusupdate, en "Weiger"/de 28s-auto-timeout doet
  voor een broadcast-aanvraag **niets aan de boeking zelf** (geen
  `cancelled`-update) — de aanvraag blijft open voor andere geschikte
  barbers, alleen déze barber navigeert terug naar het dashboard. Dat is
  een bewust verschil met de Fase 4-tak, waar weigeren/timeout wél de
  boeking annuleert (daar was de aanvraag alleen aan déze ene barber
  gericht).

## Fase 6 — architectuur (Stripe & escrow)

- **Stripe Connect: Express-accounts.** Barbers zijn zzp'ers — Stripe host
  de volledige onboarding (KYC, bankgegevens), Groomy slaat nooit een
  rekeningnummer zelf op. De al bestaande, nooit-ingevulde
  `barber_profiles.iban`-kolom is daarmee overbodig voor het echte
  uitbetalingspad — blijft ongebruikt in de database staan (geen
  destructieve schemawijziging), maar `/barber/profiel` verwijst er niet
  meer naar; in plaats daarvan een "Uitbetaling"-rij die de echte
  Stripe-koppelstatus toont.
- **Escrow-patroon: "separate charges and transfers", niet destination
  charges.** De klant betaalt nu (PaymentIntent, geld landt op het
  platform-Stripe-saldo, geen transfer op het moment van betalen).
  "Vasthouden" = geen Transfer aanmaken. "Vrijgeven" = alsnog een Transfer
  aanmaken naar de connected account. **Scope-vereenvoudiging**: Fase 6
  brengt `escrow_state` tot en met `released` — Stripe's eigen
  automatische payout van het Connect-saldo naar de bankrekening (de stap
  naar `paid`) volgt een eigen weekschema en bundelt meerdere transfers in
  één payout, niet 1-op-1 herleidbaar naar één specifieke boeking.
  Nauwkeurige per-boeking `paid`-tracking is bewust niet gebouwd
  (disproportionele complexiteit voor de MVP) — `paid_out_at`/`'paid'`
  blijven ongebruikt, geen destructieve wijziging.
- **De sequencing-fix (het belangrijkste stuk van deze fase)**: vóór Fase 6
  werd een boeking al aangemaakt en meteen zichtbaar/claimbaar voor
  barbers (Fase 4 direct + Fase 5 broadcast), vóórdat er ooit
  daadwerkelijk betaald was. Migratie `0009` splitst de oorspronkelijke
  gecombineerde Fase 3-policy `"Participants can view own bookings"`
  (`auth.uid() = customer_id or barber_id`) in twee losse policies: de
  klant ziet de eigen boeking altijd (nodig, want `/klant/betaling` moet
  de boeking kunnen tonen vóórdat er betaald is), de barber pas als er een
  `payments`-rij bestaat. Zelfde aanpak voor de Fase 5-broadcast-policies
  en `get_booking_customer_name()`.
- **RLS-recursion tussen `bookings` en `payments` (gevonden tijdens
  testen, gefixt in `0010`)**: de nieuwe bookings-policies query'en
  `payments` (bestaat er een betaalde rij), en payments' eigen
  langer-bestaande policy (Fase 2) query't op zijn beurt `bookings` — twee
  tabellen die elkaars RLS-policy bevragen levert oneindige recursie op
  (42P17). Zelfde onderliggende patroon als CLAUDE.md-regel 10, nu voor
  het eerst tussen twee tabellen i.p.v. één tabel die zichzelf
  bevraagt. Fix: een `security definer`-boolean-functie
  (`booking_has_payment()`) die van binnenuit RLS op `payments` omzeilt,
  zodat de cirkel op één kant doorbroken wordt.
- **Betaalmoment is de webhook, nooit een client-side signaal.** Een
  `payments`-rij ontstaat uitsluitend via `payment_intent.succeeded` in
  `/api/stripe/webhook` (service role, RLS-onafhankelijk) — vooral
  belangrijk bij iDEAL's redirect-gebaseerde bevestiging, waar een
  client-side "gelukt" onbetrouwbaar is.
- **Automatische vrijgave: pg_cron + pg_net → een beveiligde Route
  Handler**, niet rechtstreeks vanuit Postgres (de Stripe secret key hoort
  niet in de database). `/api/cron/release-escrow` is beveiligd met een
  gedeeld secret (`CRON_SECRET`, geen Supabase-sessie), verwerkt rijen
  **sequentieel** (nooit parallel, om een dubbele transfer bij een
  gedeeltelijke mislukking te voorkomen), en slaat per boeking een van
  drie redenen op als vrijgave niet kan: nog binnen de 24 uur, geblokkeerd
  door een open geschil, of de barber is nog niet Stripe-gekoppeld.
  **Bug gevonden en gefixt tijdens testen**: een mislukte Stripe Transfer
  (bv. `insufficient_capabilities_for_transfer` omdat de barber de
  onboarding nog niet had afgerond) was niet in een `try/catch` gevangen —
  crashte de hele cron-run (500) i.p.v. die ene boeking over te slaan en
  de rest van de batch gewoon te verwerken. Nu gevangen en gerapporteerd
  als `"transfer mislukt: <reden>"` in de resultaten, batch loopt door.
- **Geschillenvenster (24 uur), met hetzelfde precedent als
  `barber_status`-goedkeuring**: alleen de klant, alleen op de eigen
  boeking, alleen als `status = 'completed'`, alleen binnen 24 uur na
  `completed_at` (nieuwe kolom, gezet door een uitbreiding van
  `check_booking_status_transition()`) — afgedwongen in de RLS
  insert-policy zelf, niet alleen client-side. Resolutie blijft
  **handmatig** (SQL Editor voor `disputes.status`, Stripe Dashboard voor
  een eventuele refund) tot Fase 10 een echt adminpanel bouwt. Nieuw,
  klein scherm `/klant/geschil` (los van de Fase 7-reviewflow) — alleen
  bereikbaar vanaf `/klant/status` binnen het venster.
- **Annuleren van een betaalde boeking = automatische, volledige
  Stripe-refund.** Nieuwe Route Handler `/api/stripe/cancel-and-refund`
  vervangt de directe client-side-`updateBookingStatus`-call **specifiek
  voor de annuleer-actie** (bij zowel klant- als barber-annulering/
  weigering) — alle andere statusovergangen blijven ongewijzigd direct via
  de client. Belangrijk ontwerpdetail: de boekingsstatus-update zelf loopt
  nog steeds via de **gebruikers-sessie** (niet de service role), zodat de
  bestaande trigger-validatie niet omzeild wordt — alleen de refund-stap
  erna gebruikt de service role (nodig omdat `payments` geen client-
  schrijfrecht heeft). Geen gedeeltelijke refunds of annuleerkosten-logica
  — bewuste scope-afbakening, de bestaande "gratis tot 1 uur
  vooraf"-copy blijft decoratief.
- **Gedeelde prijsberekening** (`src/lib/pricing.ts`,
  `computePriceBreakdown()`): vervangt de verspreide inline
  `* 0.15`/`* 0.85`-berekeningen in `klant/betaling`, `klant/succes` en
  `barber/aanvraag`. Belangrijk: het bedrag dat `/api/stripe/
  create-payment-intent` daadwerkelijk aan Stripe doorgeeft komt uit
  dezelfde functie, toegepast op `bookings.price_cents_snapshot`
  (server-side, nooit een clientside bedrag vertrouwen) — garandeert dat
  UI-weergave en het echte in rekening gebrachte bedrag nooit uit elkaar
  kunnen lopen.
- **React 19 Strict Mode dubbele PaymentIntent (gevonden en gefixt tijdens
  testen)**: de `useEffect` op `/klant/betaling` die
  `create-payment-intent` aanroept is niet idempotent (elke aanroep maakt
  een echte nieuwe Stripe PaymentIntent aan) — React's dev-mode
  dubbel-uitvoeren van effects gaf daardoor twee PaymentIntents en twee
  botsende Payment Element-instanties (zichtbare fout: "Unhandled payment
  Element loaderror"). Gefixt met een `useRef`-guard die de aanroep maar
  één keer per mount toestaat.
- **Nieuwe env-variabelen** (gebruiker vult zelf in `.env.local` in, nooit
  in de chat plakken): `STRIPE_SECRET_KEY`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY` (eerste gebruik in dit project — alleen
  gebruikt in `src/lib/supabase/service.ts`, uitsluitend server-side in
  Route Handlers), `CRON_SECRET`.
- **Nieuwe, niet in het origineel designpakket aanwezige schermen/UI**
  (zelfde precedent als de Verzekering-tegel in Fase 3): het
  Stripe-onboarding-CTA-blok op `/barber/uitbetalingen` en het nieuwe
  scherm `/klant/geschil` — expliciet gemarkeerd als bewuste toevoeging.

## Fase 7 — architectuur (reviews)

- **Schema/RLS/trigger bestonden al sinds Fase 2, puur een UI-koppeling
  nodig.** De `reviews`-tabel, de insert-policy ("alleen op de eigen
  afgeronde boeking, één review per boeking via een unique constraint op
  `booking_id`") en de `update_barber_rating()`-trigger (incrementeel
  lopend gemiddelde, bijgewerkt bij elke insert) waren al correct
  ontworpen maar nog nooit aangeroepen — `/klant/review` was 100% mock en
  las zelfs geen `bookingId` uit de URL.
- **`barber_id` niet langer alleen client-vertrouwd.** De oorspronkelijke
  insert-policy valideerde wel `booking_id`/`customer_id`/`status`, maar
  niet dat het meegestuurde `barber_id` ook echt bij die boeking hoort.
  Migratie `0012` breidt de `with check` uit met `b.barber_id =
  reviews.barber_id`. De klant-kant leidt `barberId` bovendien altijd af
  uit de al-geladen boeking zelf (`getBooking()`), nooit een losse
  waarde.
- **Reviewer-naam tonen aan de barber — dezelfde `security
  definer`-truc als Fase 4.** De SELECT-policy op `reviews` was en blijft
  bewust `using (true)` (elke ingelogde gebruiker mag reviews lezen, al
  zo sinds Fase 2). Maar de naam van de reviewer joinen vanuit `profiles`
  loopt voor iedereen behalve de reviewer zelf alsnog tegen `profiles`'
  eigen "alleen eigen rij"-RLS aan — nieuwe functie
  `get_barber_reviews(p_barber_id)` (naar het patroon van
  `find_nearest_eligible_barber`) joint beide tabellen en geeft alleen
  `stars`/`text`/`created_at`/`reviewer_name` terug.
- **Eén review per boeking was al op databaseniveau afgedwongen**
  (`unique` op `booking_id`) — nu ook zichtbaar in de UI: `/klant/review`
  checkt bij laden of er al een review bestaat en toont dan een
  duidelijke "al beoordeeld"-staat i.p.v. het formulier, en de
  "Laat een review achter"-knop op `/klant/status` verdwijnt in dat
  geval.
- **De "gemiddelde beoordeling"-helft van de roadmap-eis stond er al**:
  `/klant/barbers` toont `ratingAvg`/`ratingCount` sinds Fase 4 al live
  via `getApprovedBarbersWithServices()` — elke barber liet alleen
  "Nieuw op Groomy" zien omdat er nooit een review-rij bestond. Geen
  wijziging nodig aan dat scherm, ging vanzelf echte cijfers tonen zodra
  Fase 7 landde (live bevestigd tijdens testen).
- **Fooien bewust verwijderd, niet gebouwd of gedecoreerd laten staan**
  (met de gebruiker afgestemd): het oude mock-scherm had een volledig
  decoratieve "Geef een fooi"-knop (€2/€5/€10) zonder enige
  schema/backend-ondersteuning (geen kolom, geen Stripe-koppeling) — stond
  niet in de Fase 7-roadmap-eis. Een latere fase kan dit alsnog echt
  bouwen (nieuwe kolom + bedrag bovenop de betaling via Stripe) als
  gewenst.
- **Geen barber-antwoord-op-review-functie** — niet gevraagd, geen
  UI-entry-point hiervoor in het designpakket.

## Fase 8 — architectuur (notificaties)

- **Eén centraal inzendpunt, geen losse verzendactie per gebeurtenis.**
  Elke bron (betaling, geschil, review-herinnering) blijft alleen een rij
  in `notifications` inserten — precies het patroon dat al sinds Fase 2
  bestond voor `accepted`/`en_route`/`arrived`. Nieuw is één trigger op
  `notifications` zelf, `fan_out_notification()`, die via `net.http_post`
  (pg_net) een POST doet naar `/api/notifications/send`. Zelfde
  `app_config`/`CRON_SECRET`-opzet als `trigger_escrow_release()` uit
  Fase 6 (hergebruikt, geen nieuw secret) — zolang `app_config.api_base_url`
  op de placeholder staat vuurt de trigger niet af, precies zoals bij
  escrow-release.
- **Welke bron vult welk van de 7 `notification_type`-waarden** (het
  schema uit Fase 2 was al met exact deze 7 roadmap-woorden ontworpen):
  `accepted`/`en_route`/`arrived` bleven ongewijzigd (Fase 5, klant,
  in-app). Nieuw in Fase 8: `payment_received` (klant) en `new_request`
  (barber) via een `after insert on payments`-trigger, `dispute` (barber)
  via een `after insert on disputes`-trigger, en `review_reminder`
  (klant) via een uur-cron (`trigger_review_reminders()`, zelfde
  `cron.schedule`-patroon als de escrow-job) die afgeronde boekingen
  >24u zonder review en zonder eerdere herinnering opzoekt en dedupliceert
  op een eerder verstuurde `review_reminder`-rij.
- **`new_request` bewust alleen voor directe toewijzing, niet voor een
  broadcast-aanvraag.** Op het moment dat een klant betaalt voor een
  broadcast-aanvraag (Fase 5) staat `bookings.barber_id` nog op `null` —
  om dan alsnog alle in-aanmerking-komende barbers te notificeren zou de
  volledige straal-/beschikbaarheid-matching-logica gedupliceerd moeten
  worden voor een fan-out naar meerdere gebruikers. Bewust niet gebouwd
  (beperkte MVP-waarde: barbers zien een broadcast-aanvraag toch al via de
  bestaande dashboard-polling zodra ze online zijn) — genoteerd als
  vervolgpunt hieronder.
- **E-mail via Resend, `src/lib/resend.ts`** — zelfde lazy-`getResend()`-
  singleton-patroon als `src/lib/stripe.ts`. Eén simpele HTML-template
  (`notificationEmailHtml`), geen React Email/MJML. Gestuurd naar
  `profiles.email`, gegateerd door de nieuwe kolom
  `profiles.email_notifications_enabled` (default `true`), gekoppeld aan
  de al-bestaande maar tot nu toe decoratieve toggle op
  `/klant/instellingen` (en nieuw ook op `/barber/profiel`).
- **Bug gevonden en gefixt tijdens testen: de Resend SDK gooit geen
  exception bij een API-fout.** `emails.send()` retourneert `{ data,
  error }` — de oorspronkelijke code checkte alleen of de `await` zonder
  `catch` gebeurde en rapporteerde daardoor `"email": "sent"` ook toen er
  in werkelijkheid nul mails verstuurd waren. Ontdekt door Resend's eigen
  `/emails`-lijst-API te bevragen en die leeg te zien terwijl de route
  succes claimde (zelfde principe als regel over nooit alleen op "geen
  exception" vertrouwen bij Supabase-calls, regel 42-46 in
  `src/app/api/notifications/send/route.ts`). Gefixt door `error`
  expliciet te checken. Ná de fix bleek de échte reden precies Resend's
  gedocumenteerde sandbox-gedrag: zonder geverifieerd domein mag alleen
  naar het eigen accountadres verstuurd worden — bevestigd door een
  testprofiel tijdelijk op het echte accountadres te zetten en een
  echte, aangekomen mail te zien via Resend's eigen API.
- **Push via Web Push (VAPID), geen native app.** Nieuw pakket
  `web-push`, nieuwe tabel `push_subscriptions` (`user_id`, `endpoint`
  uniek, `p256dh`, `auth`), rechtstreekse client-insert/delete met RLS
  ("alleen eigen rijen"), geen aparte Route Handler nodig voor het
  aanmaken zelf. `public/sw.js` toont de notificatie bij een `push`-event
  en opent de meegegeven `url` bij een klik. `src/lib/push.ts` bevat de
  client-helpers (`subscribeToPush`/`unsubscribeFromPush`) die de
  browser-toestemming vragen, de service worker registreren en de
  subscription-rij beheren. `/api/notifications/send` stuurt bij elke
  bestaande subscription van de gebruiker een push en ruimt een rij
  automatisch op bij een `404`/`410` van de push-service (subscription
  niet langer geldig aan browserkant).
- **Live push-testen kon niet volledig in deze sandbox** — de
  browser-testtool heeft `Notification.permission` vast op `"denied"`
  staan (geen promptbare `"default"`-staat), waardoor er nooit
  daadwerkelijk toestemming gegeven kan worden. Wel bevestigd: het
  subscribe-pad faalt netjes (`false` terug, geen crash, toggle blijft
  correct uit) wanneer toestemming geweigerd is. Vergelijkbaar met de
  Stripe-onboarding-formulierbeperking uit Fase 6 — genoteerd als
  vervolgpunt hieronder.
- **Nieuwe barber-kant van notificaties, geen scope-uitbreiding maar
  noodzakelijk voor een correct gebouwd `dispute`-type.** Barbers hadden
  vóór Fase 8 geen enkele zichtbaarheid op een tegen hen geopend geschil.
  Nieuw scherm `/barber/notificaties` (gedeelde `NotificationsList`-
  component met `/klant/notificaties` i.p.v. duplicatie) + de tot nu toe
  inerte Bell-`IconButton` op `/barber/dashboard` kreeg een `onClick`.
  `getNotificationsForCustomer` hernoemd naar `getNotificationsForUser`
  (functiebody ongewijzigd, filterde altijd al puur op `user_id`) om dit
  zonder duplicatie te ondersteunen. Nieuwe "Meldingen"-sectie op
  `/barber/profiel` (barbers hebben sinds Fase 1 geen apart
  instellingenscherm — zelfde precedent als de logout-knop die toen al
  direct op `profiel` kwam) met dezelfde twee toggles als
  `/klant/instellingen`.
- **Nieuwe env-variabelen** (gebruiker vult zelf in `.env.local` in, VAPID-
  sleutels door mijzelf lokaal gegenereerd met `npx web-push
  generate-vapid-keys`, nooit in de chat getoond): `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

## Fase 9 — architectuur (wallet & loyaliteit)

### Kernpatroon: ledger + afgeleide balance, nooit losse client-updates

`wallets` (1 rij per profiel, klant én barber, auto-aangemaakt via een
trigger op `profiles`) heeft `balance_cents`/`loyalty_points`, maar is
voor clients alleen leesbaar — geen insert/update-grant. Elke mutatie
loopt via de `security definer`-functie `credit_wallet()`, die de kolom
update én een `wallet_ledger_entries`-rij wegschrijft in dezelfde
transactie. `credit_wallet()` heeft zelf geen execute-grant voor clients
(een functie met een vrije `user_id`-parameter zou anders misbruikt
worden om jezelf te crediteren) — alleen intern aangeroepen door
`process_wallet_topup`, `redeem_loyalty_points` en `award_referral_bonus`,
wat zonder extra grants werkt omdat Postgres bij geneste aanroepen de
rechten van de aanroepende functie-eigenaar gebruikt.

### Wallet is bewust losstaand van het boekingsbetaalproces

Walletsaldo kan een boeking niet (deels) betalen — boekingen blijven
100% via Stripe lopen, exact zoals sinds Fase 6. Bewuste keuze van de
gebruiker om geen regressierisico te introduceren in de al geteste
`create-payment-intent`/escrow/refund/geschil-flow. De enige wijziging
aan die bestaande route is de kortingscode-parameter (zie hieronder).

### Opwaarderen + bonus

Nieuwe, losse route `/api/wallet/create-topup-intent` (geen parameter op
de bestaande boekings-payment-intent-route, om die zwaar geteste flow
niet aan te raken). Bonusregel is een vaste constante in
`src/lib/wallet.ts` (`WALLET_TOPUP_BONUS_THRESHOLD_CENTS`/`_RATE`, nu
€50-drempel/10%) — zelfde precedent als `PLATFORM_FEE_RATE`
("instelbaar maken hoort bij een toekomstig adminpanel"). De Stripe-
webhook kreeg een nieuwe, vroeg-`return`ende tak vóórin de
`payment_intent.succeeded`-handler voor `metadata.type === "wallet_topup"`,
die `process_wallet_topup()` aanroept — de bestaande boekings-tak is
ongewijzigd en wordt voor dit event-type nooit bereikt.

### Loyaliteitspunten — alleen klanten

Een nieuwe, losse `after update on bookings`-trigger (naast de bestaande
statusmachine-trigger uit 0005/0009, raakt die niet aan) kent 1 punt per
volledige euro `price_cents_snapshot` toe zodra een boeking naar
`completed` gaat — uitsluitend aan `customer_id`. Barbers krijgen wél een
wallet (voor referral-bonussen), maar geen puntenopbouw: ze worden al
direct uitbetaald via escrow, punten daarbovenop zou een verkapte tweede
commissie-verlaging zijn zonder duidelijk doel. Inwisselen via
`redeem_loyalty_points()` (1 punt = 1 cent, minimum 500 punten) — deze
functie mag wél een `authenticated`-execute-grant hebben (in tegenstelling
tot `credit_wallet`) omdat hij intern `auth.uid()` gebruikt i.p.v. een
vrije user-id-parameter.

### Kortingscodes — de enige wijziging aan een bestaande, geteste route

`create-payment-intent` accepteert nu een optionele `discountCode`. Als
die is meegegeven, roept de route `redeem_discount_code()` aan (valideert
+ committeert atomisch met een `for update`-lock, race-vrij bij
gelijktijdige verzoeken met dezelfde code) en trekt het resultaat af van
`totalCents` vóórdat de Stripe-PaymentIntent wordt aangemaakt. De
`unique (discount_code_id, user_id)`-constraint op
`discount_code_redemptions` dwingt "eenmalig per gebruiker" af op
databaseniveau. De webhook zoekt bij het schrijven van de `payments`-rij
de bijbehorende redemption op (via `booking_id`, uniek) en trekt
`discount_cents` af van `amount_cents` — `platform_fee_cents`/
`barber_payout_cents` blijven ongewijzigd (uit `price_cents_snapshot`
berekend): het platform absorbeert de korting uit de eigen marge, de
barber-uitbetaling verandert niet. **Geen adminpanel in deze fase**
(komt in Fase 10, zie Roadmap) — codes worden tot dan handmatig via de
SQL Editor aangemaakt, zelfde precedent als de `barber_status`-
goedkeuring.

### Referral-systeem

`profiles.referral_code` (uniek, 6 tekens, auto-gegenereerd) en
`referred_by_id` — `handle_new_user()` (0001) is uitgebreid om bij
registratie een code te genereren én een meegegeven code op te zoeken
(ongeldige/lege code faalt de registratie niet). Bonus (€5 referrer, €5
referee) wordt toegekend bij de **eerste afgeronde boeking van de
referee**, niet bij registratie of betaling: een account registreren of
zelfs betalen kost niets en bewijst geen echte klant, pas een
daadwerkelijk afgeronde dienst wel. Idempotentie via de query zelf (geen
extra kolom nodig) — bevestigd met een tweede afgeronde boeking die
terecht geen nieuwe bonus opleverde.

### Nieuwe/gewijzigde bestanden

`supabase/migrations/0014_wallet_loyalty_fase9.sql` (volledig schema) +
`0015_fix_wallet_topup_notification_locale.sql` (bugfix, zie
statusblok). `src/lib/wallet.ts` (topup-constanten + display-only
loyalty/referral-constanten, moeten in sync blijven met de hardcoded
SQL-waarden — zelfde geaccepteerde duplicatie-precedent als het
24-uurs-venster tussen `release-escrow/route.ts` en de migraties).
Nieuwe route `/api/wallet/create-topup-intent`. Gewijzigd:
`/api/stripe/webhook`, `/api/stripe/create-payment-intent`. Nieuwe
gedeelde componenten `src/components/wallet/{WalletOverview,
TopupCheckout,TopupSuccess}.tsx`. Nieuwe schermen `/klant/wallet` +
`/barber/wallet` (elk met `page`/`opwaarderen/page`/
`opwaarderen/succes/page`). Gewijzigd: `klant/profiel`/`barber/profiel`
(nieuwe Wallet-Row), `klant/register`/`barber/register` (optioneel
referral-code-veld), `klant/betaling` (kortingscode-invoerveld, en de
flow kreeg een expliciete "Doorgaan naar betalen"-stap vóór de Stripe
Payment Element verschijnt — nodig om tijd te geven voor het invullen
van een code vóórdat de PaymentIntent wordt aangemaakt).

## Fase 10 — architectuur (admin dashboard)

### Toegang — zelfde app, losstaande identiteit

Geen apart admin-project/-deploy (disproportioneel voor één operator) —
een nieuwe routegroep `/admin/*` in dezelfde Next.js-app, met een eigen
`/admin/login` (geen "Registreren"-link, geen kruisverwijzing vanuit
klant-/barberschermen). Een admin-account is bewust géén `profiles`-rij
(geen `barber_status`/`onboarding_completed`/`referral_code` die daar
toch niet op zouden slaan) maar een eigen, kleine `admin_users`-tabel.
`handle_new_user()` (0001, laatst uitgebreid in 0014) kreeg een nieuwe
`create or replace`: als `raw_user_meta_data ->> 'role' = 'admin'`, wordt
een `admin_users`-rij aangemaakt en de klant/barber-registratielogica
(inclusief de `user_role`-enum-cast) volledig overgeslagen. Middleware
bepaalt of iemand admin is via hetzelfde `user_metadata.role`-mechanisme
dat al voor klant/barber-routing bestond (geen extra JWT-parsing nodig).
Er bestaat geen publiek registratiepad voor een admin-account — het
eerste is aangemaakt via de Supabase Admin API, zelfde techniek als
eerdere E2E-testaccounts.

**Hoe klanten/barbers dit nooit te zien krijgen**: (1) geen UI-verwijzing
ergens in `/klant/*`/`/barber/*`; (2) `admin_users` is een losstaande
identiteit, geen overlap met `user_role`; (3) middleware blokkeert
`/admin/*` hard — een klant/barber die er per ongeluk op terechtkomt
wordt **stil** teruggestuurd naar de eigen home (`ROLE_HOME[role]`), geen
foutmelding die verraadt dat er een adminpanel bestaat.

### De permissie-valkuil (zie ook het statusblok bovenaan)

`admin_users` en `admin_action_log` hebben, net als `discount_codes`
(Fase 9), bewust **nul client-grants** — alleen de service role mag ze
lezen/schrijven. Een select met de gewone sessie-client geeft daardoor
altijd `permission denied` terug, óók voor een echte admin. Zowel
`middleware.ts`'s `/admin/*`-gate als de gedeelde `requireAdmin()`-helper
(`src/lib/supabase/admin.ts`, gebruikt door elke `/api/admin/*`-route)
gebruiken daarom een tweetrapspatroon: de sessie-client bepaalt **wie**
er aanroept (`auth.getUser()` — dat kan de service role niet, die heeft
geen eigen sessie), en `createServiceClient()` doet de daadwerkelijke
`admin_users`-lookup.

### Alle admin-mutaties via `/api/admin/*` met de service role

Geen enkele bestaande RLS-policy op `payments`/`disputes`/`reviews`/
`discount_codes` is verruimd — die blijven "nul client-toegang, alleen
service role" (Fase 6/7/9). Elke schrijvende actie gaat via een nieuwe
Route Handler (`createServiceClient()` + `requireAdmin()`-check vooraf),
gevolgd door `logAdminAction()` (zelfde bestand) die een rij wegschrijft
in `admin_action_log` — nieuw scherm `/admin/logboek` toont die reverse-
chronologisch. Leesoperaties (de admin-schermen zelf) gebruiken
rechtstreeks `createServiceClient()` in server components, geen aparte
API-route nodig voor een read.

### Geschillen — hergebruikt Fase 6-infrastructuur, dupliceert niets

Twee resolutiepaden, geen van beide een hergebruik van de bestaande
`/api/stripe/cancel-and-refund`-route (die annuleert ook de boeking zelf,
wat hier fout zou zijn — de dienst is wél geleverd):
- **Terugbetalen aan klant**: `disputes.status → resolved` +
  `stripe.refunds.create()` + `payments.escrow_state → refunded`.
  `bookings.status` blijft `completed`.
- **Vrijgeven aan barber**: alleen `disputes.status → dismissed`. De
  bestaande `release-escrow`-cron (0011, elke 15 min) slaat een boeking
  met een *open* geschil al bewust over — zodra het geschil niet meer
  open is, pakt de eerstvolgende cron-run de vrijgave vanzelf op, geen
  aparte "nu vrijgeven"-knop nodig.

### Schorsen (klant + barber) — hergebruikt een dode kolomwaarde uit Fase 1/2

`barber_status` heeft sinds `0002_barber_status_suspended.sql` (Fase 1/2)
al een `suspended`-waarde, destijds toegevoegd maar tot deze fase nooit
door de app gezet. De "Schorsen"-actie in `/admin/barbers` zet 'm nu
voor het eerst. Tot nu toe sloot alleen de matching-query (Fase 5) een
niet-`approved`-barber uit — een geschorste barber kon nog gewoon
inloggen en `/barber/*` gebruiken. `middleware.ts` haalt daarom voor
`/klant/*`/`/barber/*` (niet voor `/admin/*`, dat blijft de losstaande
`admin_users`-check) ook `suspended`/`barber_status` op en stuurt bij
een treffer naar het nieuwe, gedeelde `/geschorst`-scherm (toegevoegd aan
`PUBLIC_ROUTES`). Klanten hebben geen statuskolom zoals barbers — nieuwe
kolom `profiles.suspended boolean not null default false` (0016).

### Reviews verwijderen — sluit een gat dat sinds Fase 2 openstond

Er bestond nog geen enkel schrijfpad naar een review-delete (zelfs de
eigenaar kon een review nooit verwijderen, zie 0003) — en de bestaande
`on_review_created`-trigger (Fase 7, houdt `barber_profiles.rating_avg/
rating_count` bij) had geen after-delete-tegenhanger. Nieuwe trigger
`on_review_deleted` (0016) herberekent volledig vanaf `reviews` (i.p.v.
de insert-trigger's incrementele formule om te keren) — geen
afrondingsdrift, en het aantal reviews per barber is te klein om
performance-impact te geven.

### Nieuwe/gewijzigde bestanden

`supabase/migrations/0016_admin_fase10.sql` — `admin_users`,
`admin_action_log`, `profiles.suspended`, `handle_new_user()`-uitbreiding,
`on_review_deleted`-trigger. `src/lib/supabase/admin.ts`
(`requireAdmin`/`logAdminAction`). `src/middleware.ts` (nieuwe
`/admin/*`-tak + schorsing-check). Nieuw, gedeeld `src/app/geschorst/
page.tsx`. Nieuw `src/app/admin/{layout,login/page}.tsx` (bewust geen
`PhoneShell` — desktop-georiënteerd werktuig, geen mobiele app) +
`src/components/admin/AdminShell.tsx` (sidebar-navigatie). Nieuwe
schermen `src/app/admin/{page,barbers,geschillen,betalingen,reviews,
kortingscodes,gebruikers,logboek}/page.tsx` (server components,
`createServiceClient()`). Nieuwe routes `src/app/api/admin/{barbers/
status,customers/suspend,disputes/resolve,reviews/delete,discount-codes/
create,discount-codes/toggle}/route.ts`. Nieuwe read-helpers in
`src/lib/supabase/queries.ts`.

## Fase 11 — architectuur (productie)

**Security headers + CSP** (`next.config.ts`): een vaste set
(`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options:
DENY`, `Referrer-Policy`, `Permissions-Policy` — camera/microfoon/
geolocatie dicht, worden nergens in de app gebruikt) geldt altijd. De
`Content-Security-Policy` geldt **alleen bij `NODE_ENV=production`** —
Next.js' dev-server heeft `unsafe-eval` (webpack HMR) nodig, dat zou een
strikte CSP alleen in de weg zitten zonder productiewaarde. De CSP's
`connect-src`/`img-src` worden dynamisch samengesteld uit de Supabase-
host (`NEXT_PUBLIC_SUPABASE_URL`) en Sentry's ingest-host (uit de DSN) —
geen los te onderhouden hardcoded lijst.

**Error-/404-boundaries** (`src/app/{error,global-error,not-found}.tsx`,
nieuw): er bestond nog geen enkele — een onverwachte fout toonde
Next.js' kale default-scherm. `error.tsx` vangt fouten binnen de layout
en stuurt ze door naar Sentry; `global-error.tsx` is het vangnet als de
root layout zelf faalt (moet daarom zelf `<html>/<body>` leveren, importeert
`globals.css` rechtstreeks). Geen van beide gebruikt `PhoneShell` (kunnen
ook voor `/admin/*` triggeren, waar een telefoonframe niet zou passen).

**Sentry** (`@sentry/nextjs`): `src/instrumentation.ts` +
`src/instrumentation-client.ts` + `src/sentry.{server,edge}.config.ts`
(Next.js 15's actuele App Router-conventie — geen losse
`sentry.client.config.ts`+handmatige import meer). `next.config.ts` is
gewrapt met `withSentryConfig`. Bewust **geen** `SENTRY_AUTH_TOKEN`/
sourcemap-upload in deze fase (`sourcemaps: { disable: true }`) — dat
vereist een Sentry-organisatie-koppeling die niet nodig is om
foutmeldingen te ontvangen, alleen om ze met originele bestandsnamen/
regelnummers te zien. Eén env var (`NEXT_PUBLIC_SENTRY_DSN`) voor zowel
client als server/edge — een DSN is geen geheim, dus geen aparte
server-only variant nodig. Zonder deze var init't Sentry met
`dsn: undefined` en verstuurt simpelweg niets — breekt lokaal
ontwikkelen dus niet.

**Rate limiting** (`src/lib/rate-limit.ts`, nieuw): Vercel's serverless
functions delen geen geheugen tussen aanroepen, dus een in-memory teller
werkt niet — vandaar **Upstash Redis** (`@upstash/ratelimit` +
`@upstash/redis`, gratis tier, HTTP-based dus ook in Edge-context
bruikbaar). `checkRateLimit(request, opts)` retourneert een kant-en-klare
429-response of `null` (vroege-return-stijl, zelfde patroon als
`requireAdmin()`), per-IP sliding window. Zonder
`UPSTASH_REDIS_REST_URL`/`_TOKEN` (lokaal ontwikkelen) is er bewust
**geen** limiet — geen harde afhankelijkheid om lokaal te kunnen werken.
Toegepast op: `POST /api/geocode` (enige volledig onbeveiligde route —
geen sessie-check, dus het meeste misbruikrisico; de User-Agent-string
richting Nominatim is ook bijgewerkt, stond nog op een letterlijke
"niet in productie"-tekst), `/api/stripe/create-payment-intent` en
`/api/wallet/create-topup-intent` (al sessie-gebonden, extra laag tegen
geautomatiseerd misbruik), en alle `/api/admin/*`-mutatieroutes
(defense-in-depth bovenop `requireAdmin()`). **Niet** toegepast op
`/admin/login`/`/klant/login`/`/barber/login` — die gaan rechtstreeks
via `supabase.auth.signInWithPassword()` vanuit de client naar Supabase,
buiten onze eigen API-routes om; Supabase's eigen auth-rate-limiting dekt
dat deel al af.

**SEO** (`src/app/{robots,sitemap}.ts`, nieuw): bewust minimaal, want dit
is grotendeels een ingelogde app-ervaring. `robots.ts` staat alleen `/`
toe, sluit `/klant`, `/barber`, `/admin`, `/auth`, `/api`, `/geschorst`
uit. `sitemap.ts` bevat alleen `/` — uit te breiden zodra er publieke
marketingpagina's bijkomen. Beide gebruiken een nieuwe gedeelde
`src/lib/site-url.ts` (`NEXT_PUBLIC_SITE_URL` → Vercel's automatische
`VERCEL_URL` → `localhost:3000`, in die volgorde) — dezelfde helper zet
ook `metadataBase` en de nieuwe Open Graph/Twitter-velden in
`layout.tsx`. `src/app/icon.tsx` genereert een functionele
placeholder-favicon (zwart vlak, designtoken `primary`, witte "G") via
Next.js' `ImageResponse` — er bestaat nog geen echt gedesigned logo, zie
"Bekende gaps".

**Performance**: `next.config.ts`'s `images.remotePatterns` staat nu de
Supabase Storage-host toe, en de enige overgebleven rauwe `<img>`-tag
(`src/components/admin/BarbersTable.tsx`, barber-portfoliofoto's) is
vervangen door `next/image`. Verder geen brede performance-refactor — de
app heeft al server components voor data-fetching, geen zware
client-bundels; een bundle-analyse is pas zinvol bij echte
productie-traffic.

**Escrow-cron in productie**: géén nieuwe Vercel Cron nodig — Fase 6's
`0011_escrow_release_cron.sql` had hier al een echte `pg_cron`/`pg_net`-
job voor (elke 15 minuten, rechtstreeks vanuit Supabase). Die job slaat
zichzelf tot nu toe over zolang `app_config.api_base_url` nog de
`VUL-HIER-JE-ECHTE-DEPLOY-URL-IN`-placeholder is — zie "Checklist voor
live gaan" voor de stap om dat na de eerste deploy bij te werken.

**Env vars — volledig overzicht** (zie ook `.env.local.example`, nu
compleet incl. de sinds Fase 8 ontbrekende Resend/VAPID-vars):

| Var | Sinds | Verandert bij live gaan? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Fase 1 | Nee (zelfde project, zie checklist-punt 7) |
| `SUPABASE_SERVICE_ROLE_KEY` | Fase 6 | Nee |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Fase 6 | **Ja** — test-mode → live-mode-sleutels |
| `STRIPE_WEBHOOK_SECRET` | Fase 6 | **Ja** — nieuw endpoint tegen de productie-URL geeft een nieuw secret |
| `CRON_SECRET` | Fase 6 | Nee (moet wel gelijk blijven aan `app_config.cron_secret`) |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Fase 8 | Nee (wel: domein verifiëren, zie Openstaande acties) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Fase 8 | Nee |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Fase 11 | Nee — pas invullen zodra je een Upstash-database hebt |
| `NEXT_PUBLIC_SENTRY_DSN` | Fase 11 | Nee |
| `NEXT_PUBLIC_SITE_URL` | Fase 11 | **Ja** — zet zodra de deploy-URL (of later: eigen domein) bekend is |

**Checklist voor live gaan** (stap-voor-stap, alleen relevant zodra je
daadwerkelijk wil lanceren — niet blokkerend voor nu):
1. Vercel-project aanmaken, GitHub-repo koppelen (of CLI-deploy).
2. Alle env vars uit de tabel hierboven invullen in Vercel (eerst met de
   test-mode Stripe-sleutels, zodat je de deploy zelf kan proberen zonder
   al meteen live te gaan).
3. Zodra de deploy-URL bekend is: `app_config.api_base_url` bijwerken
   naar die URL via de Supabase SQL Editor (`update public.app_config set
   value = 'https://...' where key = 'api_base_url';`) — pas dan gaat de
   al bestaande `pg_cron`-job voor escrow-release echt draaien.
4. Sentry-project aanmaken (Settings → Client Keys → DSN) en Upstash-
   database aanmaken (of de Vercel Marketplace-integratie voor Upstash,
   die de env vars automatisch invult) — credentials in Vercel zetten.
5. Resend-domein verifiëren (SPF/DKIM bij je domeinregistrar) — al
   genoteerd als openstaande actie sinds Fase 8, nu pas relevant.
6. Supabase-back-upinstellingen controleren in het dashboard (hangt af
   van je Supabase-plan) — geen code, puur een instelling.
7. **Bewuste keuze, aan jou**: dit ene Supabase-project bevat nu
   test-data (test-boekingen, het `+admin`-testaccount, etc.). Advies:
   gewoon dit project blijven gebruiken voor launch (een nieuw, leeg
   project betekent alle migraties opnieuw doorlopen voor iets wat prima
   op te schonen is) — met als losse stap: test-rijen verwijderen via de
   SQL Editor vlak vóór livegang. Zeg het als je liever een schoon
   productie-project wil.
8. Stripe naar live mode zetten (eigen Stripe-dashboard-toggle) + een
   nieuw webhook-endpoint tegen de productie-URL aanmaken → nieuwe
   `STRIPE_WEBHOOK_SECRET` in Vercel.
9. Smoke test op de productie-URL: registreren, boeken, betalen (klein
   bedrag), review, admin-login.
10. Domein (zodra aangeschaft): DNS bij je registrar + Vercel "Add
    Domain", `NEXT_PUBLIC_SITE_URL` bijwerken. Losse, latere stap.

## Nieuwe/gewijzigde bestanden (Fase 11)

`next.config.ts` (headers, `images.remotePatterns`, `withSentryConfig`).
`src/app/{error,global-error,not-found,icon,robots,sitemap}.tsx/.ts`
(nieuw). `src/instrumentation.ts`, `src/instrumentation-client.ts`,
`src/sentry.{server,edge}.config.ts` (nieuw). `src/lib/rate-limit.ts`,
`src/lib/site-url.ts` (nieuw) — toegepast in `src/app/api/geocode/
route.ts` (+ User-Agent-fix), `src/app/api/stripe/create-payment-intent/
route.ts`, `src/app/api/wallet/create-topup-intent/route.ts`, en de zes
`/api/admin/*`-mutatieroutes. `src/app/layout.tsx` (OG/Twitter-metadata).
`src/components/admin/BarbersTable.tsx` (`next/image`).
`.env.local.example` (compleet overzicht, incl. de sinds Fase 8
ontbrekende Resend/VAPID-vars).

## Pre-launch audit — architectuur

Nieuwe migratie `supabase/migrations/0017_prelaunch_audit_fixes.sql`
bundelt de database-kant van de Critical/High-fixes; de rest zit in
route-/componentwijzigingen. Per bevinding:

**Critical 1 — `bookings`-INSERT liet elk veld ongecontroleerd door.**
De insert-policy checkte alleen `auth.uid() = customer_id`, nooit de
inhoud — een klant kon via een directe `supabase.from("bookings").insert()`
in de browser-devtools een boeking forgeren met `status: 'completed'` en
een zelfgekozen `price_cents_snapshot`. Dat maakte twee dingen mogelijk:
nep-reviews plaatsen zonder ooit te betalen (de reviews-policy checkt
alleen `status = 'completed'`, niet of er een betaling was), en
prijsmanipulatie op een echte boeking (`create-payment-intent`/de webhook
vertrouwen `price_cents_snapshot` onvoorwaardelijk voor zowel het
geïncasseerde bedrag als de barber-uitbetaling). Fix: een nieuwe
`before insert`-trigger (`set_booking_snapshot_on_insert`) forceert
`status = 'requested'` en leidt `service_name_snapshot`/
`price_cents_snapshot`/`duration_minutes_snapshot` altijd zelf af uit de
`services`-rij (nooit de client-waarden), en valideert dat een
meegegeven `barber_id` ook echt bij die dienst hoort. De insert-grant
zelf is bovendien kolom-beperkt (zelfde precedent als de al bestaande
kolom-beperkte update-grant op deze tabel) — een tweede verdedigingslinie
mocht de trigger ooit een gat hebben.

**Critical 2 — een barber kon zelf `stripe_payouts_enabled` op `true`
zetten.** De kolom-grant uit Fase 6 (`0009_stripe_escrow.sql`) liet
`authenticated` deze kolom direct schrijven, zonder `with check` op de
policy. Een barber die Connect-onboarding gestart maar de KYC nooit
afgemaakt had, kon zo de escrow-cron's KYC-check omzeilen
(`release-escrow/route.ts` vertrouwt dit veld onvoorwaardelijk) en een
Stripe-transfer naar een ongeverifieerd account laten plaatsvinden. Fix:
`revoke update (stripe_payouts_enabled) ... from authenticated` — dit
veld wordt voortaan uitsluitend door de `account.updated`-webhook gezet.
`stripe_account_id` blijft bewust wél client-schrijfbaar:
`connect-onboarding/route.ts` zet die legitiem via de sessie-client zelf
bij het aanmaken van het Connect-account.

**Critical 3 — een boeking kon permanent vastlopen op `arrived`/
`in_progress`.** `check_booking_status_transition()` staat vanaf die
statussen geen enkele cancel meer toe (bewust, voor de normale klant-/
barberflow), en een geschil vereist `status = 'completed'` — dus als een
barber-app crasht ná "Ik ben er" of "Start knipbeurt", bleef de boeking
(en het escrowbedrag) voor altijd hangen, zonder enig herstelpad in de
app. Fix: nieuw adminscherm `/admin/boekingen` +
`POST /api/admin/bookings/force-resolve` — toont boekingen die op
`arrived`/`in_progress` staan met hoelang al, met twee acties ("Forceer
voltooid" / "Forceer annuleren + terugbetalen"). Gebruikt de service-role
client, die de trigger's rolvalidatie sowieso al overslaat
(`auth.uid() is null`, bestaand gedrag sinds Fase 6) — `completed_at`
wordt daarom expliciet zelf gezet, want dat zet de trigger normaal alleen
in het (voor service-role overgeslagen) validatiepad.

**High — dubbele PaymentIntent voor dezelfde boeking.** Tussen "intent
aangemaakt" en "webhook bevestigt" bestond geen enkele server-side lock;
twee (bijna-)gelijktijdige aanroepen konden allebei een aparte Stripe
PaymentIntent aanmaken — de tweede, succesvolle betaling had daarna geen
enkele databaserij (de webhook's insert faalt stil op de unique
constraint, zonder dat de fout gelogd werd). Fix:
`idempotencyKey: \`payment-intent-\${bookingId}\`` op
`paymentIntents.create()` — Stripe geeft bij een herhaalde aanroep met
dezelfde key altijd hetzelfde PaymentIntent-object terug. De webhook
checkt nu ook expliciet de insert-fout en stuurt die (behalve de
verwachte `23505`-unique-violation bij een normale webhook-redelivery)
door naar Sentry, zodat een écht verdwenen betaling nooit meer onopgemerkt
blijft.

**High — escrow-release-cron zonder locking tussen overlappende runs.**
Geen enkel mechanisme voorkwam dat twee gelijktijdige invocaties (de
15-minuten-`pg_cron`-job + bv. een handmatige test-run) dezelfde
`held`-betaling allebei oppakten en de barber dubbel uitbetaalden. Fix:
nieuwe, kort-levende `escrow_state`-waarde `'releasing'` — de cron claimt
een rij eerst atomisch (`update ... where escrow_state = 'held'`, zelfde
patroon als `claimBooking()`) vóór de Stripe-transfer; bij een mislukte
transfer gaat de rij terug naar `'held'` zodat de volgende run het gewoon
opnieuw probeert.

**High — review-rating verschilde tussen aanmaken en verwijderen.** De
insert-trigger berekende incrementeel uit de al afgeronde vorige waarde;
de delete-trigger (Fase 10) deed een echte herberekening. Een simulatie
tijdens de audit liet zien dat dit in ~17% van willekeurige
review-reeksen een ander getal oplevert. Fix: `update_barber_rating()`
doet nu ook een volledige herberekening (`avg(stars)`/`count(*)` direct
uit `reviews`), identiek aan de delete-trigger — kan nooit meer
uiteenlopen.

**High — barber niet genotificeerd bij annulering door de klant.**
`notify_customer_on_status_change()` dekte alleen accepted/en_route/
arrived (zelf al genoteerd als open punt in de Fase 5-migratie); een
barber die onderweg was naar een net-geannuleerde rit kreeg dat nergens
te zien. Fix: dezelfde trigger uitgebreid met `completed` (klant) en
`cancelled` in beide richtingen — als de klant annuleert, krijgt de
(al toegewezen) barber nu ook een notificatie.

**High — systemische stille foutafhandeling.** ~20 plekken (boeking
bevestigen, barber-onboarding afronden, statussen doorlopen, online-
toggle, review versturen, en alle vijf admin-tabelacties) negeerden een
mislukte Supabase-/fetch-aanroep en gingen door alsof het gelukt was.
Gefixt door overal de bestaande, al aanwezige referentiestijl
(`klant/annuleren`, `klant/geschil`) te kopiëren: `res.ok`/`error`
checken, een inline foutbanner tonen, geen navigatie bij falen. Bij
`barber/dashboard`'s online-toggle wordt de optimistic-update bovendien
teruggedraaid bij een mislukte schrijfactie, anders denkt de barber dat
die online staat terwijl de database nog offline zegt.

**High — vier admin-mutatieroutes loggen "succes" zonder rijen te
raken.** `barbers/status`, `customers/suspend`, `discount-codes/toggle`,
`reviews/delete` deden een blinde `.update()`/`.delete()` — Supabase
geeft geen `error` terug als er 0 rijen matchen, dus een admin-actie op
een niet-bestaand/niet-matchend ID werd alsnog als geslaagd gelogd in
`admin_action_log`. Ondermijnt precies het doel van dat logboek
("terugkijken naar wat ik heb gedaan", de expliciete Fase 10-eis). Fix:
elke route checkt nu `.select()`'s teruggegeven rijen en geeft een 404 bij
nul treffers, vóór `logAdminAction()` wordt aangeroepen.

**High — dispute-refund kon "opgelost: terugbetaald" loggen zonder
terug te betalen.** Als de escrow al vrijgegeven was (bv. de 15-minuten-
cron won de race met de admin) werd het refund-blok stil overgeslagen,
maar het geschil toch als "Terugbetaald aan klant" gemarkeerd — een vals
audit-spoor. Fix: de route geeft nu een 409-fout terug ("mogelijk al
vrijgegeven aan de barber, gebruik 'Vrijgeven aan barber'") in plaats van
een leeg succes te loggen; de Stripe-call zelf is ook in een try/catch
gezet zodat een mislukte refund niet alsnog als opgelost geregistreerd
wordt.

**High — `Row`/`Checkbox`/`Radio`/`Dialog` niet met toetsenbord
bedienbaar.** Deze vier gedeelde bouwstenen (gebruikt op bijna elk
scherm) hadden geen `role`, `tabIndex` of keyboard-handler — een
toetsenbordgebruiker kon simpelweg niets aanklikken. Fix in de
componenten zelf (dus automatisch overal): `Row` krijgt `role="button"`/
`tabIndex`/Enter-Space-handler zodra er een `onClick` is; `Checkbox`/
`Radio` zijn herbouwd op een echte `<button role="checkbox|radio"
aria-checked>` (zelfde patroon als het al bestaande, correcte `Switch`);
`Dialog` krijgt `role="dialog"`/`aria-modal`/`aria-labelledby`,
Escape-to-close, en een eenvoudige focus-trap (Tab/Shift+Tab blijven
binnen het paneel cirkelen) + initiële focus op het paneel bij openen.

**High — `/barber/profiel` toonde overal mock-data.** `CURRENT_BARBER`
(uit `src/lib/mock-data.ts`) leverde het ritten-aantal, werkgebied,
diensten-samenvatting en beschikbaarheid — elke echte barber zag dus
permanent dezelfde nep-cijfers op zijn eigen profielpagina, ook al was de
echte data al beschikbaar (`profile.city`/`workAreaKm`/`availability` uit
`getBarberProfile()` werden al opgehaald maar niet gebruikt). Fix: een
echte `count`-query op afgeronde boekingen, een echte `services`-query
voor de dienstensamenvatting, en het al aanwezige `profile`/
`availability`-object voor werkgebied/beschikbaarheid.

## Nieuwe/gewijzigde bestanden (pre-launch audit)

`supabase/migrations/0017_prelaunch_audit_fixes.sql` (nieuw).
`src/app/api/admin/bookings/force-resolve/route.ts`,
`src/app/admin/boekingen/page.tsx`,
`src/components/admin/StuckBookingsTable.tsx` (nieuw) +
`AdminShell.tsx`-navlink. `src/lib/supabase/queries.ts`
(`getStuckBookingsForAdmin`). `src/app/api/stripe/{create-payment-intent,
webhook}/route.ts`, `src/app/api/cron/release-escrow/route.ts`,
`src/app/api/admin/{barbers/status,customers/suspend,discount-codes/
toggle,reviews/delete,disputes/resolve}/route.ts`. `src/lib/types.ts`
(`EscrowState` + `'releasing'`), `src/app/admin/betalingen/page.tsx`,
`src/app/barber/uitbetalingen/page.tsx`,
`src/components/shared/EscrowDot.tsx` (idem). `src/components/shared/
Row.tsx`, `src/components/ui/{Checkbox,Radio,Dialog}.tsx` (a11y).
`src/components/admin/{BarbersTable,DisputesTable,UsersTable,
DiscountCodesPanel,ReviewsTable}.tsx`,
`src/app/klant/{boeking,review}/page.tsx`,
`src/app/barber/{aanmelden,dashboard,rit,aanvraag}/page.tsx`
(foutafhandeling). `src/app/barber/profiel/page.tsx` (echte data i.p.v.
mock).

## Verificatie (nog door jou te bevestigen na de migratie-push)

`npm run build`/`npm run lint` zijn schoon. Niet end-to-end met een echte
sessie getest binnen deze audit-sessie (geen testaccount-credentials
beschikbaar) — checklist voor de eerstvolgende keer dat je met een echt
account inlogt:
1. Probeer als klant via de browser-devtools een boeking te forgeren
   (`supabase.from("bookings").insert({..., status: "completed"})`) —
   moet nu een `raise exception` teruggeven, niet meer stil slagen.
2. Zet als barber via devtools `stripe_payouts_enabled` op `true` op je
   eigen rij — moet nu een permission-fout geven.
3. `/admin/boekingen`: forceer een testboeking (handmatig op `arrived`
   gezet via de SQL Editor) voltooid, en apart nog een keer geannuleerd +
   terugbetaald — bevestig dat beide acties in `/admin/logboek`
   verschijnen.
4. Annuleer als klant een geaccepteerde boeking — bevestig dat de barber
   een notificatie krijgt (nieuw, was er niet).
5. Verwijder als admin een review, bevestig dat de rating exact
   overeenkomt met een handmatige `avg(stars)`-query.
6. Tab door een scherm met een `Dialog` (bv. uitloggen) met alleen het
   toetsenbord — bevestig dat focus binnen de dialog blijft en Escape 'm
   sluit.

## Post-audit fixes — gevonden tijdens echt gebruik (2026-07-19)

Twee problemen die pas zichtbaar werden zodra de gebruiker zelf een echt
account gebruikte — precies waar de "Verificatie"-checklist hierboven
voor waarschuwde. Geen van beide door de vier audit-reviewers gezien.

**Regressie in `handle_new_user()`** (`0018_fix_missing_profile_
extensions.sql`): `0016_admin_fase10.sql` (Fase 10) verving deze
trigger-functie volledig om de `admin`-rol te ondersteunen, en liet
daarbij per ongeluk de `insert into barber_profiles`/`insert into
customer_profiles` weg die sinds `0003_booking_system_schema.sql`
bestond. Postgres-functies worden bij `create or replace` in hun geheel
vervangen, niet incrementeel gepatcht — dus elke klant/barber die sinds
Fase 10 registreerde (ontdekt via de eigen `randylucassen@gmail.com`-
testaccount van de gebruiker, en het nieuw aangemaakte barber-testaccount)
mist stilzwijgend zijn `barber_profiles`/`customer_profiles`-rij. Bij een
barber breekt dat het meeste (services.barber_id verwijst naar
barber_profiles.id) — pas zichtbaar geworden dankzij de foutmelding die
de pre-launch-audit-fix op `/barber/aanmelden` (zie hierboven,
"foutafhandeling") nu wél toont. `0018` herstelt de trigger én backfilt
met een algemene `not exists`-insert (geen hardgecodeerde user-id's) —
repareert dus ook accounts die nu nog niet bekend zijn als geraakt.

**Verificatiestatus was zichtbaar, niet afgedwongen**: Fase 10's bewuste
keuze was dat `middleware.ts` alleen `suspended` blokkeert voor
`/barber/*`, niet `pending`/`rejected` (matching sluit ze toch al
stilzwijgend uit, dus geen financieel risico) — met als reëel neveneffect
dat een net-geregistreerde barber gewoon bij `/barber/dashboard` kwam,
zichzelf online kon zetten, en nergens een statusindicator zag. `src/
middleware.ts` dwingt dit nu af, in twee stappen (barber-routes alleen):
- `profiles.onboarding_completed = false` → altijd naar
  `/barber/aanmelden`.
- `onboarding_completed = true` en `barber_status` is `pending`/
  `rejected` → altijd naar `/barber/in-behandeling`.

`/barber/in-behandeling` had voorheen een "Naar dashboard"-knop die deze
hele afscherming omzeilde (bedoeld als snelkoppeling, in de praktijk de
exacte bypass) — vervangen door "Uitloggen", zelfde patroon als
`/geschorst`. De bestaande auto-redirect-naar-dashboard-bij-approved (in
een `useEffect` op deze pagina) blijft ongewijzigd.

Beide bevestigd via een echte browsersessie (2026-07-19): een pending
barber die inlogt landt direct op `/barber/in-behandeling`; een
handmatige navigatiepoging naar `/barber/dashboard` wordt teruggestuurd.
`npm run build`/`npm run lint` schoon.

**"Demo · states"-sectie verwijderd uit `/barber/profiel`**: een
dev-only navigatiesectie uit de oorspronkelijke design/mock-fase (snel
tussen UI-states schakelen tijdens bouwen), nooit opgeruimd. Bevatte
o.a. een link terug naar `/barber/aanmelden` — een al-goedgekeurde
barber kon zo zonder nieuwe admin-controle zijn KvK/documenten/diensten
opnieuw indienen. Gesignaleerd door de gebruiker tijdens live gebruik.
Verwijderd: de hele sectie (4 links) uit `barber/profiel/page.tsx`, plus
de twee daardoor volledig onbereikbaar geworden onderliggende schermen
`src/app/barber/geannuleerd-door-klant/` en `src/app/barber/leeg/
[kind]/`. `klant/profiel` had een vergelijkbare "Demo · states"-sectie
(4 links naar `/klant/fout/*` en `/klant/review`) — ook verwijderd, op
verzoek. Die onderliggende schermen zijn daar wél nog gewoon in gebruik
via echte flows (`/klant/status`, `/klant/boeking`), dus alleen de
snelkoppelingen zijn weg, niet de pagina's zelf.

**`/barber/dashboard` had geen polling voor nieuwe aanvragen**: de check
of er een nieuwe (directe of broadcast-)aanvraag is liep maar één keer,
bij het laden van de pagina — een barber die al op het dashboard stond
zag de "Nieuwe aanvraag"-banner dus nooit vanzelf verschijnen, in
tegenstelling tot `/klant/status` dat al wél polling gebruikte.
Gesignaleerd door de gebruiker na een aanvraag die "niet aankwam" (bleek
gewoon correct in de database te staan, alleen niet live zichtbaar).
Gefixt: dezelfde check draait nu elke 5 seconden opnieuw zolang de
pagina open staat, met opruiming bij unmount.

**Klant kon een lopende aanvraag niet meer terugvinden na wegnavigeren**:
`/klant/status` had zelf altijd al een volwaardige live-statusweergave
(voortgangsbalk, annuleren, "wachten op bevestiging"-copy voor
`requested`, polling elke 4s) — maar was alleen bereikbaar via de link
op `/klant/succes` direct na betalen. Eenmaal weg (bv. terug naar home),
was er nergens een weg terug. De helper `getActiveBookingForCustomer()`
(`queries.ts`) bestond hiervoor al sinds Fase 4, maar werd nergens
aangeroepen. Nu gewired op `/klant/home`: een "Lopende boeking"-kaart
bovenaan zodra er een niet-afgeronde boeking is, met de actuele status
en een link naar `/klant/status?bookingId=...`. Bevestigd via een echte
browsersessie (een al openstaande `requested`-aanvraag verscheen direct
in de banner, doorklikken landde correct op de statuspagina).

Zijdelings ontdekt tijdens het testen van deze fix, niet aangepakt (niet
gevraagd): `src/components/ui/Card.tsx` gebruikt net als `Row.tsx` vóór
de pre-launch-audit-fix een kale `<div onClick>` zonder
`role="button"`/`tabIndex`/keyboard-handler — dezelfde a11y-tekortkoming,
alleen gemist toen `Row`/`Checkbox`/`Radio`/`Dialog` destijds gefixt
werden. Card wordt breed gebruikt (`klant/home`, `klant/barbers`, ...).

**"Plan in"-knop op `/klant/boeking` leek niet te werken**: bleek bij
onderzoek geen logica-bug — `setAsap(!asap)` wisselde altijd correct. Het
probleem was puur visueel: de daaropvolgende native `<input type="date">`/
`<input type="time">` waren ongestileerd en zaten opeengepakt in een
13px-hoge rij, waardoor ze in de praktijk onzichtbaar/onbruikbaar
aanvoelden. Vervangen door twee volwaardige, gelabelde `Input`-componenten
(zelfde primitive als de rest van de app) die alleen verschijnen zodra
"Plan in" actief is. Bevestigd via een echte browsersessie: knop wisselt
"Zo snel mogelijk" ↔ "Ingepland", datum/tijd-velden verschijnen duidelijk
zichtbaar.

**"Geen barbers beschikbaar" ondanks online barber binnen werkgebied**:
geen bug — `find_nearest_eligible_barber()` (`0007_matching.sql`) via
`barber_is_online_and_available()` vereist zowel `is_online = true` als
dat de huidige weekdag in de eigen `availability`-schema van de barber op
`true` staat. `availability`'s kolom-default (`0004_barber_
verification.sql`) heeft `"Zo": false` — beide testbarbers stonden nog op
die default, en de testdag was een zondag. Bevestigd door de matching
live te reproduceren: na het aanzetten van "Zondag" in de `availability`
van een testbarber vond dezelfde aanvraag (Domplein 1, Utrecht) de barber
direct (€35,00, 30 min). Geen codewijziging nodig — actie voor de
gebruiker: "Zondag" aanzetten op `/barber/beschikbaarheid` voor barbers
die ook in het weekend willen testen/werken.

**Adressuggesties tijdens typen** (nieuw, op verzoek): een nieuwe
`AddressAutocomplete`-component (`src/components/shared/
AddressAutocomplete.tsx`) toont een gedebouncete (350ms, vanaf 4 tekens)
dropdown met straat/huisnummer/plaats-suggesties, gewired op
`/klant/home` en `/klant/boeking`. Bewust een andere bron dan de
bestaande geocoding: Nominatim (`/api/geocode`) verbiedt in zijn eigen
gebruiksvoorwaarden expliciet autocomplete/typeahead-gebruik — in plaats
daarvan een nieuwe proxy-route `/api/address-suggest` naar **PDOK
Locatieserver** (Kadaster/NL-overheid, gratis, keyless, specifiek voor
dit doel), ratelimited zoals de andere routes. `/api/geocode` (Nominatim)
blijft ongewijzigd de bron voor de uiteindelijke lat/lng-opzoek zodra een
klant een adres heeft gekozen. Bevestigd via een echte browsersessie:
typen van "Domplein 1 Utr" toont direct echte PDOK-suggesties.

`npm run build`/`npm run lint` schoon na deze drie fixes.

**"Lopende boeking"-banner op `/klant/home` bleef zichtbaar na annuleren**:
kon niet reproduceren via normale klikroutes of zelfs via de eigen
terug-knop van de browser in deze (Chromium-based) testomgeving — de `useEffect`
op `/klant/home` haalt bij elke echte mount/hernavigatie correct opnieuw
op, en `getActiveBookingForCustomer()` sluit `cancelled`/`completed`
terecht uit. Wel een plausibele, bekende oorzaak geïdentificeerd en
proactief afgedekt: mobiele browsers (vooral iOS Safari) kunnen deze
pagina uit hun **back/forward-cache (bfcache)** herstellen zonder de
React-component opnieuw te mounten — na terugkeren van `/klant/annuleren`
zou de banner dan de staat van vóór het verlaten van de pagina blijven
tonen, zonder dat er een nieuwe fetch plaatsvindt. Gefixt door een
`pageshow`-listener toe te voegen die bij `event.persisted === true`
(bfcache-restore) de actieve boeking opnieuw ophaalt. Bevestigd via een
gesimuleerde bfcache-restore (booking server-side op `cancelled` gezet
buiten de pagina om, daarna een synthetic `pageshow`-event met
`persisted: true` gedispatched) — banner verdween direct zonder
paginaherlading, wat bevestigt dat de listener werkt zoals bedoeld.

**Vervolg — de banner bleef alsnog staan, en dit keer was het wél een
echt datagat**: de `pageshow`-fix loste een hypothetisch probleem op,
maar de daadwerkelijke oorzaak was simpeler: een **dag-oude testboeking**
("Randy Test" → Test Barber, direct geboekt, niet auto-match) stond nog
altijd op `requested` — nooit geaccepteerd, geweigerd of geannuleerd,
`updated_at` identiek aan `created_at`. De banner toonde dus terecht een
reële, alleen tot dan toe onzichtbare, vergeten aanvraag (vóór deze
sessie bestond er nergens een "Lopende boeking"-indicator op
`/klant/home`). Handmatig geannuleerd via de service-role, banner
bevestigd weg.

Onderliggende productgat: **een aanvraag naar één specifieke barber (of
een broadcast die niemand claimt) had geen timeout** — bleef voor altijd
op `requested` staan als er nooit gereageerd werd. Opgelost met een 30
minuten-timeout, zelfde architectuurpatroon als de bestaande escrow-
release-cron (`0011`): nieuwe migratie `0019_expire_stale_requests.sql`
(pg_cron, elke 5 min, via `net.http_post` + `app_config`/`CRON_SECRET`)
roept een nieuwe Route Handler `/api/cron/expire-stale-requests` aan die
`requested`-boekingen ouder dan 30 minuten atomisch claimt (zelfde
`update ... where status = 'requested'`-patroon als `claimBooking()`/
release-escrow, voorkomt dubbele verwerking bij overlappende runs),
annuleert (`cancelled_by` blijft `null` — er is geen actor, alleen
`'customer'`/`'barber'` bestaan als `user_role`-enum-waarden) en, als er
toch al betaald was vlak vóór de timeout, via Stripe terugbetaalt (zelfde
logica als `cancel-and-refund/route.ts`). `notify_customer_on_status_
change()` (0007/0017) uitgebreid met een derde tak voor `cancelled_by is
null` — informeert zowel de klant ("Aanvraag verlopen") als, bij een
directe aanvraag, de barber. Nog te pushen door de gebruiker; lokaal (nog
geen echte deploy-URL in `app_config.api_base_url`) draait de pg_cron-job
zichzelf over — handmatig testen kan met `select public.trigger_expire_
stale_requests();` in de SQL Editor, of rechtstreeks `curl` naar de route
met de `CRON_SECRET` (zelfde aanpak als `release-escrow`).

**Drie kleinere live-gebruik-fixes (2026-07-20)**:

- **Rating/verdiensten op `/barber/dashboard` klopten niet met `/barber/
  profiel`**: bleken geen datagat maar letterlijk hardgecodeerde mock-
  waarden uit de design-fase (`"4,9"` en `"€128"`) die bij het wiren van
  het dashboard (Fase 4) nooit vervangen waren — `/barber/profiel` gebruikt
  al sinds Fase 7 het echte `barber_profiles.rating_avg`. Dashboard nu ook
  gekoppeld aan `rating_avg` (zelfde `–`-fallback als profiel bij nog geen
  reviews), en "Vandaag" berekent nu echt de som van vandaags `barber_
  payout_cents` uit `getPaymentsForBarber()` (excl. `refunded`), dezelfde
  bron als `/barber/verdiensten`.
- **Geschillen — contact vóór terugbetalen/uitbetalen**: nieuwe "Bericht
  sturen"-knop per open geschil in `DisputesTable` (klant/barber/beide
  kiezen, vrije tekst, verstuurt via de bestaande Resend-integratie uit
  Fase 8 — `POST /api/admin/disputes/message`, nieuw). Bewust e-mail i.p.v.
  een in-app threadscherm (met de gebruiker afgestemd): geen nieuwe tabel/
  UI voor gesprekken nodig, antwoorden komen gewoon terug in de eigen
  mailbox. Elk verstuurd bericht wordt gelogd in `admin_action_log`
  (zichtbaar in `/admin/logboek`) als informeel audit-spoor.
- **`/klant/status` toonde de barbernaam al tijdens "Aanvraag verstuurd"**:
  bleek geen bug in de zin van verkeerde data — bij een directe boeking
  (klant kiest zelf een specifieke barber, i.p.v. automatisch toewijzen)
  staat `barber_id` al bij het aanmaken vast, dus de naam die getoond werd
  was gewoon de echt gekozen barber. Op verzoek toch aangepast: de naam
  verschijnt nu pas zodra de barber de aanvraag daadwerkelijk heeft
  geaccepteerd (`status !== 'requested'`), voor beide boekingswegen
  hetzelfde gedrag. De naam-fetch stond voorheen ook alleen in de
  ééndelige `refresh().then(...)` bij het laden van de pagina — losgetrokken
  naar een aparte `useEffect` die op elke poll-tick reageert, zodat de naam
  ook verschijnt zonder dat de klant de pagina handmatig ververst zodra een
  latere poll de acceptatie oppikt.

Alle drie bevestigd via een echte browsersessie (direct booking naar een
testbarber: geen naam zichtbaar bij "requested", naam verschijnt correct
zodra `status` naar `accepted` gaat). `npm run build`/`npm run lint`
schoon. Geen migratie nodig voor deze drie.

**Vier verdere live-gebruik-fixes (2026-07-20)**:

- **"Recent" op `/klant/home` updatete nooit**: bleek net als de oude
  barber-dashboard-cijfers hardgecodeerde mock-data uit de design-fase
  ("Yusuf El Amrani", "Knip + baard") die bij het wiren in Fase 4 nooit
  vervangen was. Nieuwe query `getRecentCompletedBookingsForCustomer()`
  (twee losse queries — `approved_barbers` is een view, geen tabel met
  een door PostgREST herkende FK, dus geen embed) toont nu de laatst
  afgeronde boekingen met echte barbernaam/dienst/tijd-geleden; "Opnieuw"
  boekt dezelfde barber+dienst direct opnieuw. Sectie verdwijnt als er nog
  geen afgeronde boeking is (geen lege placeholder nodig). Bevestigd via
  een echte browsersessie: een testboeking met "Test Barber" verscheen
  direct als "Test Barber — Knipbeurt · 1 d geleden".
- **Adressuggestie vereiste een dubbele klik**: `AddressAutocomplete`
  zette `value` bij een klik op een suggestie via dezelfde `onChange` als
  getypte tekst — dat triggerde de gedebouncete fetch-`useEffect` opnieuw,
  die ~350ms later de net-gesloten dropdown weer open zette (leek dan
  alsof de eerste klik niks deed). Fix: een `skipNextFetchRef`-guard die
  de eerstvolgende fetch na een `select()` overslaat. Bevestigd via een
  echte browsersessie: "Sabelhof 1" intypen, één klik op een suggestie,
  dropdown blijft dicht (ook na de volledige debounce-periode).
- **`/klant/status` toonde ook bij "Knipbeurt bezig" de barbernaam
  geprefixt** ("Randy Veel plezier!"): dezelfde naam-prefix-logica als de
  eerdere `/klant/status`-fix, alleen was die niet volledig weggehaald.
  Bleek bovendien voor praktisch elke status grammaticaal fout te zijn
  (alleen de tekst bij `accepted`, "komt eraan", was er ooit voor
  geschreven) — nu volledig verwijderd: de sub-tekst per status staat op
  zichzelf, de naam staat al zichtbaar in de barber-kaart eronder.
  Bevestigd via een echte browsersessie: "Knipbeurt bezig" / "Veel
  plezier!" zonder naam ervoor.
- **Geen bericht bij afhandelen van een geschil**: `/api/admin/disputes/
  resolve` wijzigde tot nu toe alleen `disputes.status`/`payments.escrow_
  state`, zonder ook maar één van beide partijen te informeren. Nu
  insert de route na afhandeling (bij zowel "refund" als "dismiss") een
  rij in `notifications` voor zowel klant als barber met een uitkomst-
  specifieke tekst — hergebruikt het bestaande `'dispute'`-notificatie-
  type (al gebruikt door `notify_on_dispute_opened`, Fase 8) en dus ook
  de bestaande `fan_out_notification`-trigger, dus in-app + e-mail voor
  beide partijen "gratis" via hetzelfde integratiepunt, geen nieuwe
  migratie nodig. Bevestigd end-to-end via een echte browsersessie (een
  losstaand testadmin-account aangemaakt om echt via de UI-route in te
  loggen en `/api/admin/disputes/resolve` aan te roepen): na "Vrijgeven
  aan barber" op een test-geschil kregen zowel de klant- als de barber-
  testaccount meteen een "Geschil opgelost"-notificatie in `notifications`.

`npm run build`/`npm run lint` schoon voor alle vier. Geen migratie nodig.

**Polling crashte op een tijdelijke netwerkstoring (2026-07-20)**: een
`TypeError: Failed to fetch` in `getPendingRequestForBarber` (aangeroepen
vanuit de 5s-poll op `/barber/dashboard`) kwam als onafgevangen fout in de
Next.js-foutoverlay terecht. Oorzaak: alle vier de `setInterval`-pollingen
in de app (`barber/dashboard`, `klant/status`, `klant/succes`, `wallet/
TopupSuccess`) deden hun Supabase-call zonder try/catch — als de
onderliggende `fetch()` zelf faalt (netwerk kort weg, laptop uit
stand-by, dev-server-herstart), gooit die een onafgevangen exception, ook
al is het maar een achtergrond-poll die de volgende tick toch gewoon
opnieuw had geprobeerd. Alle vier nu voorzien van een try/catch die een
mislukte tick stil negeert (bij de twee "wacht op betaling"-pollingen
telt een mislukte tick wél mee als poging richting de timeout, zodat die
niet oneindig blijft hangen). Bevestigd door `window.fetch` tijdelijk te
patchen zodat elke Supabase-call gedurende 6 seconden faalt (ruim boven
het 5s-pollinterval) op een ingelogde barber-dashboardsessie: geen
onafgevangen fout, pagina bleef volledig werkend, en de polling hervatte
vanzelf zodra `fetch` weer normaal werkte. `npm run build`/`npm run lint`
schoon.

**Drie nieuwe live-gebruik-fixes (2026-07-20, vervolg)**:

- **Geen visueel signaal bij ongelezen notificaties**: de bel-knop op
  `/klant/home` en `/barber/dashboard` zag er altijd hetzelfde uit, ook
  met ongelezen meldingen — moest je er eerst op klikken om te zien of er
  iets nieuws was. Nieuwe component `NotificationBell` (`src/components/
  shared/`) toont een klein rood bolletje zodra er een ongelezen
  notificatie is, gevoed door een nieuwe lichte `hasUnreadNotifications()`
  (head-only count-query, geen rijen). Op de barber-dashboard meegenomen
  in de al bestaande 5s-poll; op klant/home bij page-load/pageshow.
  Bevestigd via een echte browsersessie: bolletje verschijnt zodra er een
  ongelezen notificatie in de database staat.
- **"Recent" op klant/home bleef alsnog verouderd**: de vorige fix haalde
  `recentBookings` wel op bij de eerste mount, maar niet in de
  `pageshow`-herstel-listener (die alleen `activeBooking` ververste) — dus
  na een bfcache-restore (terug-gebaar, vooral mobiel) bleef de lijst
  hangen op de staat van vóór het laatst afgeronde gesprek. Beide nu
  samengevoegd in één `loadHomeData()` die bij zowel de eerste load als
  elke `pageshow`-restore draait. Bevestigd door een boeking server-side
  op `completed` te zetten en daarna een synthetic `pageshow`-event te
  dispatchen op de al openstaande pagina: de nieuwe boeking verscheen
  direct in "Recent", zonder herlading.
- **"Gepland"-tab op `/klant/barbers` deed zichtbaar niets**: klopte —
  de tab veranderde alleen `asap` voor de uiteindelijke boeking, nooit de
  getoonde barberslijst zelf, en de "Beschikbaar"-tekst per barber was
  bovendien een hardgecodeerde string uit de design-fase (nooit gekoppeld
  aan `barber_profiles.is_online`, ongeacht welke tab actief was).
  `BarberListItem`/`getApprovedBarbersWithServices()` uitgebreid met een
  echte `isOnline` (losse query op `barber_profiles`, geen embed via de
  `approved_barbers`-view). "Nu" toont alleen online barbers (een
  offline barber kan een aanvraag toch niet meteen beantwoorden — zie ook
  de 30-minuten-timeout hierboven); "Gepland" toont iedereen, met per
  rij een echte "Nu beschikbaar"/"Nu niet online"-status. Bevestigd via
  een echte browsersessie met één online en één offline testbarber: "Nu"
  toonde alleen de online barber, "Gepland" toonde alle drie met de
  juiste status per rij.

Zijdelings ontdekt tijdens het bouwen van de `isOnline`-fetch, apart
uitbesteed (niet in deze drie meegenomen): `grant select on public.
barber_profiles to authenticated` (0003) had geen kolomlijst — RLS is
row-level, niet column-level, dus elke klant kon via een rechtstreekse
PostgREST-call tegen `barber_profiles` (i.p.v. de veilige
`approved_barbers`-view) de volledige rij van élke approved barber lezen,
inclusief `iban`/`kvk_number`/`insurance_doc_url`/`id_doc_url`. Gefixt in
`0020_lock_down_barber_profiles_columns.sql`: kolom-grant beperkt tot de
veilige velden (incl. `is_online`, nodig voor de fix hierboven), plus een
nieuwe `get_own_barber_profile()` security-definer-functie zodat een
barber zijn eigen volledige profiel (incl. gevoelige velden) op
`/barber/profiel`/`/barber/uitbetalingen` kan blijven lezen. `getBarber
Profile()` in `queries.ts` aangepast om die functie te gebruiken.

`npm run build`/`npm run lint` schoon voor alle drie + de zijdelingse
security-fix. Migraties `0019` en `0020` — nog te pushen door de
gebruiker (zelfde `npx supabase db push`-commando dekt beide).

**Regressie van `0020`: "Aanvraag versturen is niet gelukt" (2026-07-20)**:
zodra `0020` gepusht was, faalde élke aanvraag naar de dichtstbijzijnde
barber (en elke barber die openstaande aanvragen probeerde te bekijken/
claimen) met `permission denied for table barber_profiles`. Oorzaak: twee
bestaande RLS-policies op `bookings` (`"Barbers can view/claim paid open
requests within their radius"`, uit `0010`) subquery'en `barber_profiles.
lat`/`lng` rechtstreeks, niet via een security-definer-functie — exact
CLAUDE.md-regel 10, maar dan op kolomniveau: `0020` liet `lat`/`lng`
bewust buiten de kolom-grant (met de aanname dat die alleen via
`find_nearest_eligible_barber()` bereikbaar waren), maar miste dat deze
twee bookings-policies er ook rechtstreeks van afhingen. Zodra de brede
grant weg was, kon Postgres die policy-expressie niet meer evalueren voor
de rol `authenticated` — ook niet voor rijen die toch al niet zouden
matchen — en gooide een permission-error in plaats van gewoon "geen
toegang tot deze rij". Trof zowel een klant die een nieuwe boeking
aanmaakte (de insert doet meteen een `.select()` erna, wat dezelfde
SELECT-policies evalueert) als een barber die openstaande aanvragen
bekeek.

Gefixt in `0021_fix_bookings_rls_barber_profiles_grant.sql`: nieuwe
`barber_matches_location_and_service(lat, lng, service_name)`
security-definer-functie (geeft alleen een boolean terug, nooit de
coördinaten) — dezelfde truc als `booking_has_payment()`/`is_approved_
barber()`. Beide policies aangepast om deze functie te gebruiken i.p.v.
de rechtstreekse subquery. Live gereproduceerd vóór de fix (een echte
auto-match-aanvraag gaf exact deze 403 terug, opgevangen via een
gepatchte `fetch()` in de browser om de onderliggende Supabase-foutmelding
te zien i.p.v. alleen de generieke UI-tekst) — root cause hierdoor
eenduidig bevestigd, geen giswerk. Migratie nog te pushen door de
gebruiker (zelfde commando, dekt nu `0019`+`0020`+`0021` ineen).

**Drie nieuwe live-gebruik-fixes (2026-07-21)**:

- **"Recent" op klant/home — nu écht structureel gefixt (3e poging)**: de
  vorige twee fixes (mount + `pageshow`) dekten niet de daadwerkelijke
  oorzaak. Next.js' App Router heeft een eigen **client-side router-
  cache**: terugnavigeren naar een al eerder bezochte route binnen
  dezelfde sessie kan de gecachte component-instantie herstellen i.p.v.
  een verse mount te doen — dat vuurt geen `pageshow`-event (dat is puur
  browser-bfcache, een ander mechanisme), dus de `useEffect` met de fetch
  draaide simpelweg nooit opnieuw. Opgelost door ook op `focus` (window)
  en `visibilitychange` (document) te verversen, niet alleen `pageshow`
  — samen dekken deze drie elk scenario waarin de pagina zichtbaar wordt
  zonder een echte remount. Bevestigd op de daadwerkelijk nieuwe manier:
  een boeking server-side op `completed` gezet, daarna alleen een
  synthetic `focus`-event gedispatcht (bewust niet `pageshow`, om het
  nieuwe pad te bewijzen) op een al open, ingelogde homepagina — "Recent"
  verscheen direct.
- **"Knip + baard" → "Knippen + baard"**: hernoemd in `SERVICE_TAGS`
  (klant/home) en `DEFAULT_SERVICES` (barber/aanmelden — de bron voor
  nieuwe barber-signups) plus de decoratieve mock-teksten. Omdat de
  klant-tag exact matcht tegen de servicenaam die een barber al had
  aangemaakt (zie het bestaande commentaar in klant/home), hoorde hier
  ook een backfill bij voor barbers die zich vóór deze wijziging al
  aanmeldden — anders zou de exacte match voor hen stilzwijgend blijven
  mislukken. Beide in `0022_service_rename_and_party_size.sql`.
- **Aantal personen** (nieuw, op verzoek): `bookings.party_size`
  (smallint, 1–6, default 1) in dezelfde migratie. Klant kiest het aantal
  met een +/- stepper op `/klant/boeking`; barber ziet het terug op
  `/barber/aanvraag` (aparte rij, altijd zichtbaar) en `/barber/rit`
  (compact meegenomen in de klantregel, alleen als >1). Geen nieuwe kolom-
  grant nodig — de bestaande `insert`-grant op `bookings` (0003) heeft al
  geen kolomrestrictie.

Alle drie bevestigd via een echte browsersessie waar mogelijk (de
dienst-hernoeming en de "Recent"-fix zijn live getest; "Aantal personen"
vereist eerst de migratie-push van de gebruiker om end-to-end te kunnen
testen, aangezien de kolom pas dan bestaat). `npm run build`/`npm run
lint` schoon.

**Vervolg: "Aantal personen" faalde alsnog na de `0022`-push — nieuwe,
losstaande oorzaak (2026-07-21)**: elke boeking waarbij de client
`party_size` expliciet meestuurde (dus altijd, sinds `/klant/boeking` dat
nu doet) faalde met `permission denied for table bookings`
(`42501`). Een boeking zónder `party_size` in de payload (dan geldt de
kolom-default) ging wél door — waardoor het leek alsof de fout
willekeurig optrad.

Uitgezocht door **een andere, inmiddels afgeronde achtergrondsessie**
(de `barber_profiles`-kolom-lockdown, zie hierboven) na te lopen via de
sessie-tools (volledige transcript, 637 berichten) — die bleek zich
uitsluitend tot `barber_profiles` te hebben beperkt en `bookings`
nergens te hebben aangeraakt, dus niet de oorzaak. In plaats daarvan
heeft `public.bookings` op enig moment een kolom-beperkte INSERT-grant
gekregen die **niet in een migratiebestand hier terug te vinden is** —
vermoedelijk een los/onafgemaakt script rechtstreeks tegen dezelfde
database, buiten de migratiegeschiedenis om (de gebruiker gaf aan een
ander programma niet te hebben afgemaakt). Live geïsoleerd door een
mislukt request via `curl` (authenticated klantsessie) veld voor veld
terug te brengen tot het minimale verschil — alleen `party_size` bleek
de oorzaak.

Gefixt in `0023_restore_bookings_insert_grant.sql`: de ongerestricteerde
INSERT-grant op `bookings` hersteld naar de oorspronkelijke opzet uit
`0003` (bewust geen kolomrestrictie zoals bij `barber_profiles` — voor
`bookings` is dat niet nodig, `set_booking_snapshot_on_insert` (0017)
overschrijft toch al alle veiligheidskritieke velden server-side, ongeacht
wat de client meestuurt). Gepusht en bevestigd: zowel het exacte eerder
falende `curl`-request als een volledige browsersessie (klant kiest 3
personen via de stepper op `/klant/boeking`, verstuurt de aanvraag,
landt correct op `/klant/betaling`, `party_size: 3` staat correct in de
database) slagen nu.

De inmiddels afgeronde achtergrondsessie is gearchiveerd op verzoek van
de gebruiker.

**"Aantal personen" volledig afgemaakt: prijs, duur, bezet-status en
gedeeltelijke terugbetaling (2026-07-21/23)**: na de vorige fix bleek
`party_size` puur decoratieve metadata te zijn — geen enkele berekening
hield er rekening mee. Op expliciet verzoek van de gebruiker
("voortaan eerst alle bijkomstigheden uitpluizen en voorstellen aan mij")
zijn de bijkomstigheden dit keer vooraf uitgezocht en met de gebruiker
afgestemd via `AskUserQuestion`, in plaats van er pas achteraan te
fixen zodra hij het zelf tegenkwam:

- **Prijs schaalt met `party_size`** (`0024_party_size_price_multiplier.sql`):
  `price_cents_snapshot := services.price_cents * party_size` in
  `set_booking_snapshot_on_insert()` (0017) — dezelfde plek als altijd,
  want die functie overschrijft toch al server-side wat de client
  meestuurt (regel 20). Bevestigd via een echte boeking (3 personen,
  Knipbeurt €35) → `price_cents_snapshot = 10500`, `/klant/betaling`
  toonde €105,00 + 15% servicekosten = €120,75, en na een echte
  testbetaling (Stripe test-kaart via de API bevestigd, zie regel 17)
  klopte `payments.barber_payout_cents` (8925) exact.
- **Duur schaalt mee** (`0025_duration_scaling_and_barber_busy.sql`, 30
  min/persoon): `duration_minutes_snapshot := services.duration_minutes *
  party_size` in dezelfde functie (volledige body herhaald, regel 22).
  `/klant/boeking` toont nu ook de vermenigvuldigde duur i.p.v. de
  duur voor één persoon. Bevestigd: 3 personen → `duration_minutes_
  snapshot = 90`, zichtbaar als "90 min" op zowel klant- als
  barberscherm (`/barber/aanvraag`, `/barber/rit`).
- **Barber wordt automatisch "bezet" tijdens een actieve rit** (zelfde
  migratie): `barber_is_online_and_available()` (0007) checkt nu ook
  `not exists (... bookings met status in (accepted, en_route, arrived,
  in_progress))` — een barber met een lopende boeking komt niet meer in
  aanmerking voor een nieuwe match, geen handmatige `is_online`-toggle
  nodig. Wordt automatisch weer `true` zodra de boeking
  completed/cancelled is. Bevestigd door de RPC direct aan te roepen
  vlak na het accepteren van een boeking: `false` terwijl
  `bookings.status = 'accepted'`.
- **Gedeeltelijke terugbetaling in het adminpaneel**: bij `party_size >
  1` toont `DisputesTable` een stepper ("Terugbetalen van N") naast de
  bestaande "Terugbetalen aan klant"-knop. `/api/admin/disputes/resolve`
  accepteert nu `refundPeopleCount`; is dat kleiner dan `party_size`, dan
  wordt (a) een proportioneel deel van `payments.amount_cents`
  terugbetaald via Stripe (`refunds.create` met een expliciet `amount`
  i.p.v. een volledige refund), en (b) de barber **meteen** proportioneel
  uitbetaald voor de resterende personen via `transfers.create` — niet
  pas via de 24u-escrow-cron, die deze rij toch overslaat zodra hij niet
  meer `held` is. Bewuste keuze (afgestemd met de gebruiker): zonder dit
  zou een klacht over 1 van de 3 personen de barber ook zijn verdiensten
  voor de andere 2 kosten. Vereist dat de barber al Stripe-gekoppeld is
  (`stripe_payouts_enabled`) — zo niet, dan blokkeert de route de
  gedeeltelijke terugbetaling met een duidelijke foutmelding i.p.v. een
  boeking achter te laten in een staat die de escrow-cron niet meer kan
  oppakken (`escrow_state` is een enkel veld, geen "deels vrij/deels
  terugbetaald"-status). `payments.amount_cents`/`barber_payout_cents`/
  `platform_fee_cents` worden bijgewerkt naar de daadwerkelijke,
  resterende bedragen zodat `/barber/verdiensten` en
  `/barber/uitbetalingen` (die deze kolommen rechtstreeks sommeren) geen
  verouderd bedrag tonen.

**Twee bugs gevonden en gefixt tijdens dit testen**: (1) de
refund-stepper in `DisputesTable.tsx` gebruikte in de `setState`-updater
`getRefundCount(d)` — die leest de *component-scope* `refundCounts`,
niet de `c` die de updater zelf binnenkrijgt. Bij twee snel na elkaar
gevuurde clicks (dubbelklik, of twee `+`/`−`-drukken vlak na elkaar)
zagen beide handlers nog dezelfde oude state, dus telde de teller maar
één stap i.p.v. twee. Gefixt door binnen de updater van `c[d.id]` te
lezen i.p.v. van `getRefundCount(d)`. Bevestigd: twee snelle klikken op
"−" gaan nu correct van 3 naar 1 (was: 3 naar 2). (2) Geen bug, maar een
bevestigde randgeval-check: bij een gedeeltelijke terugbetaling voor een
niet-Stripe-gekoppelde barber blokkeert de route netjes met de bedoelde
foutmelding — live bevestigd doordat het testbarber-account nog niet
door de (niet-automatiseerbare, zie regel 17) Stripe Connect-hosted-
onboarding was gegaan.

Alle vier onderdelen bevestigd via een echte browsersessie (klant + twee
barber-rollen + admin, zie hierboven per onderdeel); de "happy path" van
de proportionele barber-uitbetaling zelf (`transfers.create` na een
gedeeltelijke refund) kon **niet** end-to-end getest worden — vereist een
volledig Stripe Connect-geverifieerd testbarberaccount, en de hosted KYC-
onboarding is niet automatiseerbaar (regel 17). Wel bevestigd: de volledige-
terugbetaling-tak (ongewijzigd pad, geen Connect nodig) werkt na de
refactor nog steeds correct — een echte Stripe-refund van €120,75 kwam
exact overeen met `payments.amount_cents`. Genoteerd als vervolgpunt:
eenmalig een testbarber-account door de echte Stripe Connect-onboarding
heen halen (handmatig, door de gebruiker) om de proportionele-uitbetaling-
tak alsnog live te bevestigen. `npx tsc --noEmit`/`npm run lint` schoon.
Migratie `0025` — al gepusht door de gebruiker tijdens deze sessie.

## Bekende gaps (bewust, voor latere fases)

- ~~Live kaart is een placeholder~~ — sinds 2026-08-15 daadwerkelijk
  gebouwd (Mapbox, incl. routelijn/ETA), zie de changelog-entry in
  CLAUDE.md en "Live locatiekaart — architectuur" hieronder. Migratie
  `0033` moet gepusht zijn voordat de bijbehorende code live gaat (raakt
  een gedeelde kernquery, zie CLAUDE.md voor de precieze reden).
- **Barber-verificatiegegevens** (KvK, documenten, diensten/prijzen)
  worden sinds Fase 3 echt opgeslagen (`barber_profiles`, `services`,
  `barber-media`/`barber-documents` Storage). Nog niet gebouwd: een
  hard-blokkerende validatie op "minimaal 3 portfoliofoto's" (nu alleen
  een UI-hint) en een dynamische diensten-lijst (blijft bij de 3 vaste
  rijen uit het design) — bewuste scope-keuzes, zie Fase 3-architectuur.
- **Portfoliofoto's zijn nergens klant-facing zichtbaar** — opgeslagen
  sinds Fase 3, maar `klant/barbers` toont alleen naam/rating/prijs, geen
  barber-detailscherm. Open productvraag sinds 2026-08-14, zie
  "Openstaande acties voor jou" hieronder.
- **Opgeslagen betaalmethoden bestaan niet** — elke betaling gaat via een
  verse PaymentIntent, geen Stripe Customer/SetupIntent. Bewust
  uitgesteld sinds 2026-08-14, zie "Openstaande acties voor jou"
  hieronder.
- ~~Geen admin-goedkeuring van barbers~~ — sinds Fase 10 een echt
  adminscherm (`/admin/barbers`), zie "Fase 10 — architectuur" hierboven.
  Let op: route-gating op `barber_status` voor de barber zelf (i.p.v.
  alleen matching-uitsluiting) is ook pas in Fase 10 toegevoegd, via de
  schorsings-check in `middleware.ts` — een `pending`/`rejected`-barber
  kan overigens nog steeds gewoon bij `/barber/dashboard` (dat blokkeert
  middleware bewust niet, alleen `suspended`); dat is een bewuste,
  aparte scope-keuze, geen doorgeschoven gap.
- ~~Geen admin-resolutieflow voor geschillen~~ — sinds Fase 10 een echt
  adminscherm (`/admin/geschillen`) met twee resolutiepaden (terugbetalen/
  vrijgeven), zie "Fase 10 — architectuur" hierboven.
- **Geen precieze per-boeking `paid`-tracking** — Stripe's automatische
  payout van het Connect-saldo bundelt meerdere transfers in één payout,
  niet 1-op-1 herleidbaar naar een specifieke boeking. `escrow_state`
  bereikt in deze MVP maximaal `released`, nooit `paid`.
  `paid_out_at`/`'paid'` blijven ongebruikt.
- **Geen configureerbare commissie** — blijft een vaste 15%-constante
  (`PLATFORM_FEE_RATE` in `src/lib/pricing.ts`), instelbaar maken hoort
  bij een toekomstig adminpanel (Fase 10/11).
- **Stripe Connect Express-onboarding (Stripe's eigen gehoste
  KYC-formulier) kon niet automatisch getest worden** in de
  browser-testtool — vermoedelijk bewuste bot-weerstand op een
  identiteitsverificatieformulier (geen netwerkverzoek vuurde zelfs af bij
  een simulated klik op "Verzenden"). Account-aanmaak en de
  Account Link-redirect zelf zijn wel bevestigd te werken (curl +
  browser). Vervolgpunt: dit is de enige stap in de Fase 6-flow die nog
  nooit volledig live (met een echte afgeronde onboarding) getest is.
  Ook geprobeerd de Express-onboarding volledig via de Stripe API te
  omzeilen (test-individual-data + tokenized test-IBAN, geen hosted UI) —
  blokkeert hard op `tos_acceptance`: Stripe staat dat voor Express-
  accounts (`controller[requirement_collection]=stripe`) alleen via de
  hosted onboarding toe, niet via de API. Sinds 2026-07-23 raakt dit ook
  de gedeeltelijke-terugbetaling-feature (zie hieronder): de
  proportionele-uitbetaling-tak kon daardoor niet end-to-end getest
  worden, alleen de blokkade-melding zelf.
- **Race-conditie op gelijktijdig claimen niet met twee losse
  browsersessies getest** (zie statusblok bovenaan) — de atomische
  database-garantie is grondig doorgenomen bij het schrijven van `0007`,
  maar een live test met twee daadwerkelijk gelijktijdige claim-pogingen
  is een goed vervolgpunt.
- **Supabase's gratis mailquota blokkeert `signUp()` regelmatig** (rate
  limit, zelfde probleem als Fase 1) — voor Fase 5-testen zijn twee
  testaccounts daarom via de Supabase **Admin API** aangemaakt
  (`/auth/v1/admin/users` met de service role key en `email_confirm:
  true`), wat de client-side rate limit volledig omzeilt. Handig
  vervolgpunt voor toekomstig testen: dit is sneller en betrouwbaarder dan
  wachten op de rate limit of dashboard-"Add user" (die laatste faalt
  trouwens sowieso — zie hieronder).
- **Dashboard "Add user" werkt niet voor dit schema** — de Supabase
  Studio-flow voor het handmatig aanmaken van een gebruiker geeft geen
  `user_metadata` mee, terwijl `handle_new_user()` (`0001`) een niet-lege
  `role` verwacht (`profiles.role` is `not null`). Zonder metadata faalt
  de trigger en daarmee de hele user-aanmaak ("Database error creating new
  user"). Gebruik in plaats daarvan de Admin API met `user_metadata` erbij
  (zie hierboven).
- ~~Geen echte push-notificaties~~ — sinds Fase 8 echte e-mail (Resend) en
  browser-push (Web Push/VAPID), zie "Fase 8 — architectuur" hierboven.
- ~~Geen live kaart/real-time barber-tracking~~ — sinds 2026-08-15 gebouwd
  (Mapbox), zie CLAUDE.md's changelog en "Live locatiekaart —
  architectuur" hieronder.
- ~~Geen barber-side notificatiescherm~~ — sinds Fase 8 bestaat
  `/barber/notificaties` + de dashboard-bell, zie "Fase 8 — architectuur"
  hierboven.
- **Geen `new_request`-fan-out naar meerdere barbers bij een broadcast-
  aanvraag** (Fase 8, bewust) — alleen rechtstreekse toewijzing genereert
  een notificatie; een broadcast-aanvraag (barber_id nog `null`) blijft
  puur via dashboard-polling zichtbaar. Zou de straal-/beschikbaarheid-
  matching-logica uit Fase 5 moeten dupliceren voor een fan-out naar
  meerdere gebruikers.
- **Geen `completed`/`cancelled`-notificaties en geen e-mailvoorkeuren per
  notificatietype** (Fase 8, bewust) — de roadmap noemde precies 7 typen
  (nu allemaal gebouwd), dit blijft een open vervolgpunt. Eén
  gecombineerde "E-mailupdates"-toggle i.p.v. per-type-instelbaar, zoals
  het designpakket al aangeeft.
- **Geen native mobiele push (APNs/FCM)** (Fase 8, bewust) — Web Push
  werkt in de browser, past bij hoe de app nu gebruikt wordt (geen native
  app).
- **Live push-notificatie-aflevering nooit end-to-end bevestigd in de
  testomgeving** (Fase 8) — de browser-testtool heeft
  `Notification.permission` vast op `"denied"` staan, zie "Fase 8 —
  architectuur" hierboven. Het subscribe-pad faalt wel bevestigd netjes
  bij geweigerde toestemming. Vervolgpunt: eenmalig handmatig bevestigen
  in een echte browser met promptbare toestemming.
- ~~Geen echte betaling~~ — sinds Fase 6 een echte Stripe-betaling, zie
  "Fase 6 — architectuur" hierboven.
- Geen Supabase-gegenereerde database-types (`Database`-generic) — alle
  `.from(...)`-calls zijn functioneel maar nog niet volledig type-safe.
- OAuth (Apple/Google) staat uit; knoppen bestaan al verborgen in de UI.
- **Geen referral-bonus als de referee zelf barber wordt** (Fase 9,
  bewust) — `award_referral_bonus()` reageert alleen op
  `bookings.customer_id`; een referred barber die zijn eerste klus
  afrondt triggert niets. Vervolgpunt voor een latere fase met een eigen
  "eerste afgeronde klus als barber"-trigger.
- **Geen wallet-uitbetaling/cash-out** (Fase 9, bewust) — een klant/
  barber kan alleen opwaarderen en (bij punten) inwisselen naar saldo,
  nooit saldo terug laten uitbetalen naar een bankrekening.
- ~~Geen adminpanel voor kortingscodebeheer~~ — sinds Fase 10 een echt
  adminscherm (`/admin/kortingscodes`), zie "Fase 10 — architectuur"
  hierboven.
- **Stripe Payment Element-iframe (kaartgegevens invoeren) kon niet
  automatisch getest worden** in de browser-testtool bij het opwaarderen/
  kortingscode-testen van Fase 9 — zelfde bekende beperking als de
  Stripe Connect-onboarding uit Fase 6. Betalingen zijn wel bevestigd
  door de aangemaakte PaymentIntents rechtstreeks via de Stripe API te
  confirmen (test-kaarttoken), wat hetzelfde webhookpad triggert als een
  echte UI-betaling — zie het statusblok bovenaan voor de volledige
  toelichting.

**Abonnementen** (wél genoemd in de oorspronkelijke Fase 9-roadmaptekst)
zijn geen "gap" maar een bewust, expliciet met de gebruiker afgestemde
scope-keuze: volledig buiten Fase 9 gehouden, mogelijk als aparte, latere
fase op te pakken. Zie het statusblok bovenaan voor de volledige
redenering (eenmalige aankoop + geldigheidsperiode vs. een echte
recurring-Stripe-subscription-engine).

- **Geen apart subdomein/IP-allowlist voor `/admin`** (Fase 10, bewust)
  — ook in Fase 11 bewust niet toegevoegd (stond niet in de
  Fase 11-roadmaptekst), blijft een mogelijke latere hardening-stap.
- **Geen meerdere adminrollen/rechtenniveaus** (Fase 10, bewust) — één
  vlak "is admin"-concept, precies genoeg voor één operator.
- **Geen configureerbare commissie** blijft ook na Fase 10 een vaste
  constante (`PLATFORM_FEE_RATE`) — stond niet in de Fase 10-roadmaptekst.
- **Geen automatisch/tijdelijk schorsen** (bv. na X klachten, Fase 10,
  bewust) — schorsen is altijd een bewuste, handmatige admin-actie.
- **Adminpanel is niet mobiel-responsive** — `AdminShell.tsx` gebruikt
  een vaste `w-56` (224px) zijbalk, bewust gebouwd als desktop-werktuig
  (zie "Fase 10 — architectuur"). Getest op een 375px-mobiel-viewport
  (2026-07-19): het paneel laadt en werkt technisch prima op een telefoon
  (zelfde login/URL, geen restrictie), maar de zijbalk neemt dan ruim de
  helft van het scherm in en de content (statistiektegels, tabellen)
  wordt zichtbaar afgesneden. Gebruiker wil hier later op terugkomen —
  mogelijk vervolgpunt: inklapbare/hamburger-zijbalk onder een
  breakpoint.
- **Favicon is een functionele placeholder** (`src/app/icon.tsx`, Fase
  11) — een gegenereerd zwart vlak met witte "G" (designtoken `primary`),
  want er bestaat nog geen echt gedesigned logo in het design-pakket.
  Vervolgpunt: vervangen zodra er een echt logo/favicon-asset is.
- **Geen `SENTRY_AUTH_TOKEN`/sourcemap-upload** (Fase 11, bewust) —
  foutmeldingen komen in Sentry aan, maar zonder leesbare originele
  bestandsnamen/regelnummers (alleen geminifieerde productiecode).
  Vervolgpunt: een Sentry-organisatie-auth-token toevoegen zodra dat de
  moeite waard is.
- **Nominatim-contactinfo in de geocode-proxy is generiek** (`src/app/
  api/geocode/route.ts`) — Nominatim's gebruiksvoorwaarden waarderen een
  écht bereikbare contact-URL in de User-Agent-header; die kon nu nog
  niet ingevuld worden omdat er nog geen domein is. Vervolgpunt: bijwerken
  zodra er een domein is (zie Roadmap-stap 10 in "Checklist voor live
  gaan").

### Pre-launch audit — Medium/Low (bewust niet nu gefixt)

- **Geen server-side garantie dat een broadcast-boeking ooit een barber
  vindt** — als alle geschikte barbers offline zijn of niemand claimt,
  blijft de boeking op `requested` staan; alleen de klant kan zelf
  annuleren, geen automatische "geen barbers gevonden"-notificatie of
  auto-cancel. Vervolgpunt: een timeout-job die een langdurig open
  broadcast-verzoek signaleert.
- **`redeem_discount_code()` checkt niet of de boeking van de aanroeper
  is** — de RPC is direct aanroepbaar; een andere ingelogde gebruiker die
  een `booking_id` van iemand anders kent (bv. een barber die een open
  broadcast-aanvraag ziet) kan in theorie diens kortingscode voortijdig
  verbruiken (`discount_code_redemptions.booking_id` is uniek, dus dat
  blokkeert de échte klant daarna permanent — een griefing-risico, geen
  financieel risico). De normale app-flow (`create-payment-intent`)
  checkt eigenaarschap al wél vóór de RPC-aanroep. Vervolgpunt: dezelfde
  eigenaarschapscheck ook in de RPC zelf.
- **CSP's `script-src` bevat `unsafe-inline`** (`next.config.ts`) — dat
  ondermijnt een deel van CSP's XSS-beschermingswaarde. Een nonce- of
  hash-based aanpak is haalbaar binnen de App Router maar is een
  aparte, zorgvuldige vervolgstap (kan makkelijk iets breken als het
  slordig gebeurt).
- **`frame-ancestors` ontbreekt in de CSP** — wordt in de praktijk al
  gedekt door `X-Frame-Options: DENY`, maar CSP's eigen mechanisme is
  breder ondersteund en kost niets om ook toe te voegen.
- **Twee Stripe-routes zonder rate limit**: `/api/stripe/cancel-and-refund`
  en `/api/stripe/connect-onboarding` volgen niet de
  `checkRateLimit()`-conventie die de rest van de Stripe/wallet/admin-
  routes al heeft (CLAUDE.md-regel 18) — beide vereisen wel een geldige
  sessie en zijn tot de eigen boeking/account beperkt, dus impact is
  laag, maar het is een gemiste, makkelijk toe te voegen laag.
- **Niet-functionele "Bericht"/"Bel"-knoppen tijdens een actieve rit**
  (`klant/status`, `barber/rit`, `klant/boeking`) — renderen als
  interactieve iconen maar hebben geen `onClick`; een gebruiker die er
  middenin een boeking op tikt merkt niets. Vervolgpunt: ofwel echt
  bellen/chatten implementeren, ofwel de knoppen verbergen tot dat er is.
- **Een handvol losse schermen negeert ook nog fetch-/Supabase-fouten**
  buiten de kern-flows om: `barber/werkgebied`, `barber/beschikbaarheid`
  (opslaan), `barber/uitbetalingen` (Connect-koppelen-knop),
  `barber/aanvraag`'s `decline()`-refund-call. Zelfde patroon als de nu
  wél gefixte High-bevindingen, maar met minder directe financiële/
  vertrouwens-impact — vervolgpunt om ook deze naar de referentiestijl
  (`klant/annuleren`) om te zetten.
- **`platform_fee_cents` registreert niet de volledige marge** — het
  platform verdient feitelijk `2× feeCents` per boeking (eenmaal als
  opslag op wat de klant betaalt, eenmaal als korting op de
  barber-uitbetaling), maar `payments.platform_fee_cents` legt maar de
  helft daarvan vast. Geen geldverlies (Stripe verrekent nog steeds de
  juiste bedragen), wel een boekhoud-/rapportagegat: toekomstige
  omzetrapportages op basis van `SUM(platform_fee_cents)` onderschatten
  de werkelijke marge. Vervolgpunt: een apart `platform_margin_cents`-veld
  of de admin-betalingenweergave aanpassen zodat "totaal" ook echt klopt
  met "fee + payout".
- **Ontbrekende indexen op een aantal foreign keys** (`wallet_ledger_
  entries.user_id`, `loyalty_ledger_entries.user_id`,
  `wallet_topups.user_id`, `push_subscriptions.user_id`,
  `notifications.related_booking_id`) — Postgres indexeert foreign keys
  niet automatisch. Bij de huidige MVP-schaal geen merkbaar effect,
  goedkoop om later toe te voegen zodra dat relevant wordt.

## Openstaande acties voor jou (te bespreken aan het einde van het project)

Verzamellijst van dingen die alleen jij kunt/hoeft te doen (buiten mijn
bereik, of bewust bij jou gelaten om zelf te verifiëren) — opgebouwd per
fase, bedoeld om aan het eind van het hele traject in één keer samen door
te lopen. Niet blokkerend voor volgende fases.

- **Fase 8 — Resend-domein verifiëren — nu daadwerkelijk blokkerend**
  (bevestigd 2026-08-14): niet meer "pas relevant vlak vóór livegang" —
  de app is al live en dit blokkeert nu echt. Bevestigd met een directe
  testverzending vanuit de sandbox: Resend weigerde met `403
  validation_error`, letterlijk *"You can only send testing emails to
  your own email address ([je eigen adres]). To send emails to other
  recipients, please verify a domain at resend.com/domains…"*. Dit is
  precies waarom de gebruiker zelf wél mail kreeg (aanvraag bevestigd/
  geld in escrow) maar familie op een ander adres niet — geen codebug.
  Zonder een geverifieerd domein kan **niemand anders dan je eigen
  accountadres** ooit mail krijgen, hoeveel klanten/barbers er ook
  bijkomen. Nodig: (1) een domein (eender welk, ook een goedkoop nieuw
  domein volstaat — hoeft niet hetzelfde te zijn als een toekomstig
  app-domein), (2) dat domein toevoegen op resend.com/domains, (3) de
  SPF/DKIM-DNS-records die Resend toont bij je domeinregistrar instellen
  (toegang tot je domein-DNS heb ik niet), (4) `RESEND_FROM_EMAIL` in
  Vercel bijwerken naar een adres op dat domein (bv.
  `noreply@jouwdomein.nl`). Mislukte verzendingen komen sinds vandaag wel
  zichtbaar in Sentry terecht (`src/app/api/notifications/send/route.ts`)
  i.p.v. stil te verdwijnen in een ongelezen response. **Bewust
  uitgesteld** — gevraagd, gebruiker koos expliciet "laat voorlopig zo"
  (2026-08-14). Tot dan blijft e-mail alleen naar het eigen accountadres
  werken; in-app-notificaties (bel/`/klant/notificaties`,
  `/barber/notificaties`) werken voor iedereen gewoon door, onafhankelijk
  hiervan.
- **Fase 8 — Live push-aflevering zelf bevestigen**: de browser-testtool
  heeft `Notification.permission` vast op `"denied"` staan (geen
  promptbare staat), dus dit kon niet door mij end-to-end getest worden.
  Optioneel zelf testen: open de app in een gewone browser (telefoon of
  laptop, niet de testtool), zet "Pushmeldingen" aan via
  `/klant/instellingen` of `/barber/profiel`, accepteer de
  toestemmingsvraag, en bevestig dat een testmelding verschijnt.
- **Fase 11 — accounts aanmaken + livegang-checklist doorlopen**: Vercel-
  project, Sentry-project (DSN), Upstash-database (of de Vercel
  Marketplace-integratie) — ik kan geen van deze accounts voor je
  aanmaken. Volledige stap-voor-stap in "Checklist voor live gaan"
  (onder "Fase 11 — architectuur" hierboven), inclusief wanneer Stripe
  naar live mode moet en wanneer `app_config.api_base_url` bijgewerkt
  moet worden. Pas relevant zodra je daadwerkelijk wil lanceren.
- **Pre-launch audit — migratie pushen + met een echt account
  doorlopen**: `npx supabase db push` voor `0017_prelaunch_audit_fixes.sql`
  (bevat alle Critical/High database-fixes — zie "Pre-launch audit —
  architectuur" hierboven). Loop daarna zelf de 6 verificatiestappen
  onderaan die sectie door met een echt klant-/barber-/adminaccount — dat
  kon ik deze sessie niet met een echte ingelogde sessie testen (geen
  testaccount-credentials beschikbaar), alleen via code-review en
  build/type-check bevestigen.
- ~~Live kaart — gebouwd (2026-08-15), nu een Mapbox-token nodig~~ —
  **volledig afgerond en live bevestigd (2026-08-16)**: migratie `0033`
  gepusht, schrijf-/leespad end-to-end live getest. Drie echte bugs
  onderweg gevonden en gefixt: (1) een CSS-cascadebug (mapbox-gl.css
  overschreef Tailwinds `absolute`-class, kaart-container stortte in tot
  0px hoogte), (2) de Mapbox-token stond in Vercel als "Sensitive"
  (wordt niet aan de build-stap gegeven, terwijl `NEXT_PUBLIC_`-vars
  juist tíjdens de build ingebakken moeten worden) én de eerste
  verwijder-en-opnieuw-aanmaken-poging was nooit daadwerkelijk
  opgeslagen — pas na een tijdelijke debug-probe en een derde poging
  bevestigd aanwezig, (3) de CSP (Fase 11) miste `worker-src`/
  `api.mapbox.com` in `connect-src`, waardoor de browser zelf elke
  Mapbox-aanroep blokkeerde ondanks een geldige token. Volledig verhaal
  + de gevonden les over Vercel's "Redeploy"-knop (hergebruikt soms een
  oude commit i.p.v. de nieuwste `main`) in CLAUDE.md's changelog.
- **Portfolio vooraf zichtbaar voor klanten? — open productvraag**
  (2026-08-14, nog niet besloten). Barbers uploaden al portfoliofoto's
  bij aanmelden (Fase 3, `barber-media`-bucket), maar er bestaat geen
  klant-facing barber-detailscherm om ze te bekijken vóór het boeken —
  `klant/barbers` toont alleen naam/rating/prijs in een lijstrij. Eigen
  advies gegeven: wél tonen (sterkste vertrouwenssignaal in een
  barbermarktplaats, naast rating), maar dit is een nieuw scherm bouwen,
  geen toggle. Wacht op akkoord van de gebruiker voordat dit gebouwd
  wordt.
- **Saved payment methods ("Betaalmethoden") — bewust uitgesteld**
  (2026-08-14, `klant/instellingen`/`klant/profiel`). Elke betaling loopt
  nu via een verse Stripe PaymentIntent per boeking — geen Stripe
  Customer-object, geen SetupIntent-flow, niets persistent opgeslagen.
  Een opgeslagen-kaart-feature vereist dus echt nieuwe Stripe-
  architectuur, geen quick fix. De UI toont voorlopig eerlijk "Binnenkort
  beschikbaar" i.p.v. de oude nep-kaartgegevens uit het designpakket.

## Roadmap

Vervangen op 2026-07-17 door een gedetailleerdere versie van de gebruiker
(was voorheen 8 fases, nu 12 — dekt o.a. wallet/loyaliteit en een volwaardig
adminpanel die eerder ontbraken).

- **Fase 0 ✅ Project opzetten** — Next.js 15 + TypeScript + Tailwind,
  design tokens overgezet, alle schermen werkend met mock data.
- **Fase 1 ✅ Authenticatie** — Supabase Auth: registreren, inloggen,
  uitloggen, wachtwoord vergeten, customer-/barber-rol, beschermde routes.
  Incl. architectuur-voorbereiding voor barber-verificatiestatussen (zie
  hierboven), vooruitlopend op Fase 3.
- **Fase 2 ✅ Database** — volledig Supabase/Postgres-schema: users
  (=`profiles`, uit Fase 1), barber profiles, customer profiles, services,
  bookings, payments, reviews, disputes, notifications. Relaties, indexes,
  RLS. Schema-only, nog geen UI-wiring (zie architectuur hieronder).
- **Fase 3 ✅ Barber-verificatie** — onboarding: KvK, profielfoto, portfolio,
  verzekering-upload, werkgebied, beschikbaarheid, admin-status
  (`pending`/`approved`/`rejected`/`suspended` — datamodel hiervoor staat
  al klaar sinds Fase 1).
- **Fase 4 ✅ Boekingen** — volledige boekingsflow (dienst/adres/datum/tijd/
  opmerking kiezen), statusmachine `requested → accepted → en_route →
  arrived → in_progress → completed → cancelled`, afgedwongen door een
  database-trigger.
- **Fase 5 ✅ Matching** — automatische matching op werkgebied/straal/
  beschikbaarheid, in-app melding, eerste-acceptatie-wint, overige
  aanvragen sluiten automatisch.
- **Fase 6 ✅ Stripe & Escrow** — Stripe Connect, vooraf betalen,
  vasthouden, 24-uurs geschillenvenster, automatische vrijgave, commissie,
  uitbetaling.
- **Fase 7 ✅ Reviews** — sterren + tekst, gemiddelde beoordeling.
- **Fase 8 ✅ Notificaties** — e-mail + push voor aanvraag/acceptatie/
  onderweg/aangekomen/betaling/review-herinnering/geschillen.
- **Fase 9 ✅ Wallet & Loyaliteit** — klant-/barberwallet, loyaliteitspunten,
  opwaarderen + bonus, kortingscodes, referral-systeem. Abonnementen
  bewust uitgesteld (zie "Bekende gaps").
- **Fase 10 ✅ Admin Dashboard** — gebruikersbeheer (incl. schorsen),
  barbers goedkeuren, geschillen behandelen, betalingen bekijken, reviews
  verwijderen, statistieken, kortingscodebeheer, logboek van admin-acties.
- **Fase 11 ✅ Productie** — security headers/CSP, error-/404-boundaries,
  Sentry-monitoring, rate limiting (Upstash), SEO-basis (robots/sitemap/
  OG), `next/image`, volledig env-vars-overzicht, checklist voor live
  gaan. Zie "Fase 11 — architectuur" hierboven.

**Over Fase 2 (schema vooraf vastleggen) — bewuste afweging**: het volledige
schema in één fase ontwerpen is de juiste aanpak voor tabellen die onderling
verwijzen (bookings ↔ payments ↔ disputes), maar niet elk detail hoeft dan
al vast te liggen. Fase 2 dekt de kern-tabellen die hierboven genoemd staan
(users t/m notifications) — wallet/loyaliteit-tabellen horen bewust niet in
Fase 2, want de requirements daarvoor (puntenlogica, referral-mechanica,
abonnementstiers) zijn pas bekend als Fase 9 start. Schema-migraties blijven
incrementeel en genummerd (zoals nu al met `0001_init_profiles.sql`,
`0002_barber_status_suspended.sql`) — een latere fase die een kolom/tabel
mist voegt een nieuwe migratie toe, in plaats van Fase 2 te herschrijven.
