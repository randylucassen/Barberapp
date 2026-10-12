-- Cron-wrapper + schedule voor /api/cron/expire-asap-noshow-bookings —
-- zelfde patroon als trigger_expire_noshow_bookings (0035). Elke 2
-- minuten i.p.v. elke 5: het venster is hier 20 minuten i.p.v. 60, dus
-- een 5-minuten-cadans zou verhoudingsgewijs een veel grotere overshoot
-- geven (tot 25% van het venster) dan bij de geplande variant (~8%).
create function public.trigger_expire_asap_noshow_bookings()
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
    raise notice 'Expire-asap-noshow-bookings overgeslagen: app_config.api_base_url/cron_secret nog niet ingesteld.';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/api/cron/expire-asap-noshow-bookings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
end;
$$;

comment on function public.trigger_expire_asap_noshow_bookings() is
  'Wrapper rond net.http_post() naar /api/cron/expire-asap-noshow-bookings — handmatig te testen met `select public.trigger_expire_asap_noshow_bookings();` in de SQL Editor.';

select cron.schedule('expire-asap-noshow-bookings-job', '*/2 * * * *', 'select public.trigger_expire_asap_noshow_bookings();');
