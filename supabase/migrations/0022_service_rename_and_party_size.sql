-- Twee losse live-gebruik-fixes gebundeld:
--
-- 1) "Knip + baard" → "Knippen + baard" op verzoek van de gebruiker.
--    De klant-facing tag (SERVICE_TAGS, klant/home) matcht exact tegen de
--    naam die een barber bij aanmelden aanmaakt (DEFAULT_SERVICES,
--    barber/aanmelden) — beide zijn al hernoemd in de code, maar bestaande
--    `services`-rijen van barbers die zich vóór deze wijziging aanmeldden
--    staan nog op de oude naam. Zonder deze backfill zou de exacte match
--    voor die barbers stilzwijgend blijven mislukken (valt terug op hun
--    eerste dienst, zie pickService() in klant/barbers/page.tsx).
update public.services set name = 'Knippen + baard' where name = 'Knip + baard';

-- 2) Aantal personen — de klant geeft bij het boeken aan voor hoeveel
--    personen de afspraak is, de barber moet dat kunnen zien (aanvraag
--    accepteren, tijdens de rit). Bewust geen aparte migratie: dezelfde
--    ronde live-gebruik-fixes als hierboven.
alter table public.bookings add column party_size smallint not null default 1 check (party_size between 1 and 6);

comment on column public.bookings.party_size is
  'Aantal personen voor deze afspraak, door de klant gekozen bij het boeken (1-6). Server-side niet afgeleid — client-insert net als address/note, INSERT op bookings heeft al geen kolomrestrictie (zie grant in 0003).';
