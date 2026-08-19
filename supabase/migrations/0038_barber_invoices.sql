-- Maandelijkse btw-factuur voor de 15% servicekosten die Groomy bij
-- barbers inhoudt (B2B-dienst, factuurplicht art. 34c Wet OB — zie
-- CLAUDE.md-changelog-entry voor de volledige toelichting/afstemming).

-- ============================================================
-- Barber-adres — ontbrak nog, nodig voor een geldige factuur.
-- Zelfde cumulatieve kolom-grant-patroon als 0004/0007/0009/0037.
-- ============================================================
alter table public.barber_profiles add column address text;

grant update (address) on public.barber_profiles to authenticated;

comment on column public.barber_profiles.address is
  'Volledig factuuradres (straat, huisnummer, postcode, plaats) — invoerveld op /barber/aanmelden. Zonder dit ingevuld slaat de maandelijkse factuurgeneratie deze barber over.';

-- ============================================================
-- barber_invoices — één rij per barber per kalendermaand. line_items is
-- een bevroren snapshot op generatiemoment (een factuur mag nooit met
-- terugwerkende kracht veranderen), dus nooit live herberekend bij het
-- tonen/downloaden van een al-bestaande factuur.
-- ============================================================
create table public.barber_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity,
  barber_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  fee_excl_btw_cents integer not null check (fee_excl_btw_cents >= 0),
  btw_cents integer not null check (btw_cents >= 0),
  fee_incl_btw_cents integer not null check (fee_incl_btw_cents >= 0),
  line_items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (barber_id, period_start, period_end)
);

create index barber_invoices_barber_id_idx on public.barber_invoices (barber_id);

alter table public.barber_invoices enable row level security;

comment on table public.barber_invoices is
  'Eén rij per barber per kalendermaand, gegenereerd door /api/cron/generate-barber-invoices. Geen client-grant/RLS-policy (zelfde patroon als payments/barber_no_show_warnings) — barbers lezen via get_own_barber_invoices() hieronder, admin via de service role. unique(barber_id, period_start, period_end) voorkomt dubbele facturen bij een overlappende cron-run.';

-- Zelfde "eigen volledige rij, security definer" -truc als
-- get_own_barber_profile() (0020) — geen brede grant nodig.
create function public.get_own_barber_invoices()
returns setof public.barber_invoices
language sql
security definer
set search_path = public
stable
as $$
  select * from public.barber_invoices where barber_id = auth.uid() order by created_at desc;
$$;

comment on function public.get_own_barber_invoices() is
  'Voor /barber/facturen en de PDF-downloadroute — geeft alleen de eigen facturen van de ingelogde barber terug, nooit die van iemand anders.';

grant execute on function public.get_own_barber_invoices() to authenticated;

-- ============================================================
-- pg_cron-trigger — zelfde app_config/CRON_SECRET-opzet als de andere
-- tijd-gebaseerde crons (expire-noshow-bookings, reconcile-payments).
-- ============================================================
create function public.trigger_generate_barber_invoices()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_config where key = 'api_base_url';
  select value into v_secret from public.app_config where key = 'cron_secret';

  if v_url is null or v_url like 'VUL-HIER%' or v_secret like 'VUL-HIER%' then
    raise notice 'Generate-barber-invoices overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/generate-barber-invoices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_generate_barber_invoices() is
  'Wrapper rond net.http_post() naar /api/cron/generate-barber-invoices — handmatig te testen met `select public.trigger_generate_barber_invoices();` in de SQL Editor. Zonder body verwerkt de route de vorige kalendermaand; met een expliciete {"periodStart":"...","periodEnd":"..."}-body (alleen handmatig via curl, niet vanuit deze wrapper) een andere periode, voor testen.';

-- 1x per maand, de 1e om 03:00 — ruim buiten piekuren, en de vorige
-- kalendermaand is dan überhaupt pas net compleet afgesloten.
select cron.schedule('generate-barber-invoices-job', '0 3 1 * *', 'select public.trigger_generate_barber_invoices();');

-- ============================================================
-- Nieuwe notificatietypen (barber-kant)
-- ============================================================
alter type public.notification_type add value 'invoice_available';
alter type public.notification_type add value 'invoice_address_missing';
