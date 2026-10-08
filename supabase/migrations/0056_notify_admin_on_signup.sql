-- E-mail naar kpprtje@gmail.com bij elke nieuwe registratie (klant én
-- barber). Losse trigger rechtstreeks op `profiles` (niet in
-- handle_new_user() zelf gestopt) — die functie wordt per rol al
-- meerdere keren met `create or replace` herschreven (zie CLAUDE.md-
-- regel 22, een `create or replace` vervangt de hele body) en heeft dit
-- helemaal niet nodig: een losse AFTER INSERT-trigger op `profiles` vuurt
-- hoe dan ook, ongeacht wat `handle_new_user()` verder doet of nog gaat
-- doen.

create function public.notify_admin_on_new_profile()
returns trigger
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

  if v_url is null or v_url like 'VUL-HIER%' or v_secret is null or v_secret like 'VUL-HIER%' then
    raise notice 'Admin-signup-notificatie overgeslagen: app_config nog niet volledig ingesteld.';
    return new;
  end if;

  perform net.http_post(
    url := v_url || '/api/admin/notify-new-user',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := jsonb_build_object('profileId', new.id)
  );

  return new;
end;
$$;

comment on function public.notify_admin_on_new_profile() is
  'Stuurt een e-mail naar kpprtje@gmail.com (zie src/app/api/admin/notify-new-user/route.ts) bij elke nieuwe profiles-rij — zelfde app_config/CRON_SECRET-fire-and-forget-patroon als fan_out_notification (0013).';

create trigger on_profile_created_notify_admin
  after insert on public.profiles
  for each row execute procedure public.notify_admin_on_new_profile();
