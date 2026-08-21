-- Klant-facing barber-detailscherm (portfolio bekijken vóór het kiezen,
-- zie CLAUDE.md-changelog): `approved_barbers` (0005) had `bio` al, maar
-- `portfolio_urls` nog niet — die kolom bestond simpelweg nog niet toen
-- deze view geschreven werd. Zelfde patroon als 0005: alleen de expliciet
-- veilige kolommen doorgeven, nooit de hele barber_profiles-rij.
--
-- `portfolio_urls` bewust helemaal onderaan de select-lijst (niet tussen
-- avatar_url/bio en rating_avg/rating_count, waar het inhoudelijk beter
-- zou passen) — `create or replace view` staat geen nieuwe kolom tussen
-- bestaande kolommen toe, alleen aan het eind toevoegen (1e poging gaf
-- `cannot change name of view column "rating_avg" to "portfolio_urls"`,
-- want Postgres matcht bestaande kolommen op positie, niet op naam).

create or replace view public.approved_barbers with (security_invoker = false) as
select
  p.id,
  p.full_name,
  bp.city,
  bp.work_area_km,
  bp.avatar_url,
  bp.bio,
  bp.rating_avg,
  bp.rating_count,
  bp.portfolio_urls
from public.profiles p
join public.barber_profiles bp on bp.id = p.id
where p.barber_status = 'approved';
