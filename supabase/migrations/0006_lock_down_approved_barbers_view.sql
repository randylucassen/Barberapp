-- Fase 4 correctie: Postgres' default-privileges op de public-schema
-- gelden ook voor views (niet alleen tabellen) — approved_barbers uit
-- 0005 bleek daardoor ook voor anon leesbaar, terwijl de bedoeling was
-- "alleen authenticated" (zie de grant in 0005). Nog onschadelijk zolang
-- er geen approved barbers zijn, maar zodra die er zijn zou iemand zonder
-- in te loggen barbergegevens via een rechtstreekse API-call kunnen
-- opvragen. Zelfde revoke-eerst-patroon als de tabellen elders.

revoke all on public.approved_barbers from anon;
