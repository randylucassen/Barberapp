-- Fase 6 (vervolg): plant de escrow-vrijgave automatisch in via pg_cron +
-- pg_net, i.p.v. handmatig /api/cron/release-escrow aan te roepen zoals
-- tijdens het testen. Vereist dat de gebruiker eerst de pg_cron- en
-- pg_net-extensies aanzet via Database → Extensions in het Supabase-
-- dashboard (kan niet vanuit een migratie zelf — de extensies moeten al
-- bestaan vóórdat dit bestand gepusht wordt).
--
-- pg_cron/pg_net draaien op Supabase's eigen servers, die een openbare
-- URL nodig hebben om de app te bereiken — een lokale
-- `localhost:3001`-URL is daarvandaan niet bereikbaar. `api_base_url`
-- hieronder is daarom een placeholder tot de app een echte deploy-URL
-- heeft; de job slaat zichzelf over (met een duidelijke `notice`) zolang
-- die placeholder nog staat, i.p.v. herhaaldelijk te falen tegen een
-- nep-domein.

create table public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_config is
  'Kleine sleutel/waarde-tabel voor backend-only instellingen die de pg_cron-job nodig heeft (API-basis-URL, cron secret). Nooit client-toegankelijk (geen grants aan anon/authenticated) — bijwerken kan alleen via de SQL Editor.';

revoke all on public.app_config from anon, authenticated;

insert into public.app_config (key, value) values
  ('api_base_url', 'VUL-HIER-JE-ECHTE-DEPLOY-URL-IN'),
  ('cron_secret', 'VUL-HIER-JE-CRON_SECRET-UIT-.ENV.LOCAL-IN');

create function public.trigger_escrow_release()
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
    raise notice 'Escrow-release overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/release-escrow',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_escrow_release() is
  'Wrapper rond net.http_post() naar /api/cron/release-escrow — handmatig te testen met `select public.trigger_escrow_release();` in de SQL Editor, i.p.v. curl.';

select cron.schedule('release-escrow-job', '*/15 * * * *', 'select public.trigger_escrow_release();');
