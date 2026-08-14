-- Vangnet-cron voor gemiste Stripe-webhook-afleveringen. Zie
-- src/app/api/cron/reconcile-payments/route.ts voor de volledige
-- toelichting (productie-incident 2026-08-14, CLAUDE.md). Zelfde
-- app_config/CRON_SECRET-opzet als trigger_escrow_release (0011) en
-- trigger_expire_stale_requests (0019).

create function public.trigger_reconcile_payments()
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
    raise notice 'Reconcile-payments overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/reconcile-payments',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_reconcile_payments() is
  'Wrapper rond net.http_post() naar /api/cron/reconcile-payments — handmatig te testen met `select public.trigger_reconcile_payments();` in de SQL Editor.';

-- Elke 2 minuten — sneller dan de standaard 5-minuten-cadans van de
-- andere crons (expire-stale-requests), bewust gekozen zodat een gemiste
-- webhook-aflevering niet te lang onopgemerkt blijft voor een klant/
-- barber die meteen kijkt.
select cron.schedule('reconcile-payments-job', '*/2 * * * *', 'select public.trigger_reconcile_payments();');
