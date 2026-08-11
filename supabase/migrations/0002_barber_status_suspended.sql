-- Fase 1 (architectuur-voorbereiding): voegt "suspended" toe aan
-- barber_status, vooruitlopend op het goedkeuringsproces/adminpanel dat in
-- Fase 3 gebouwd wordt. Voer dit uit ná 0001_init_profiles.sql.

alter type public.barber_status add value 'suspended';

comment on column public.profiles.barber_status is
  'Verificatiestatus van een barber, bepaald door een toekomstig adminproces (Fase 3):
   pending   - wacht op beoordeling, standaard bij registratie, nog niet zichtbaar voor klanten.
   approved  - geverifieerd, mag zichtbaar zijn voor klanten en boekingen accepteren.
   rejected  - aanmelding afgewezen, geen toegang tot boekingen.
   suspended - tijdelijk geblokkeerd door Groomy (bv. klachten/fraude), geen toegang tot boekingen
               tot een admin de status weer op approved zet.
   Alleen null voor role=customer. Kolom is bewust niet client-updatable (zie
   grants in 0001_init_profiles.sql) — wijzigingen horen via een server-side
   admin-pad met de service role key te lopen, niet via de browser-client.';
