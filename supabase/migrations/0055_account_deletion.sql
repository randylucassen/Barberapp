-- "Account verwijderen" (Apple-eis 5.1.1v: elke app met accountaanmaak
-- moet ook account-verwijdering aanbieden). Bewust geen hard delete:
-- bookings.customer_id/barber_id -> profiles(id) staat op "on delete
-- cascade" (0003) — een echte delete van de auth.users/profiles-rij zou
-- dus ook alle boekingen/betalingen/facturen van de ANDERE partij
-- (barber resp. klant) meesleuren, en de wettelijke 7-jaars-bewaarplicht
-- voor de btw-administratie van barbers breken. In plaats daarvan:
-- login blokkeren (via de Auth Admin API in de aanroepende route, niet
-- hier) + persoonsgegevens anonimiseren, boekingen/betalingen/facturen
-- blijven onder het geanonimiseerde profiel bestaan.

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Gezet door request_account_deletion() — alleen een audit-tijdstip, geen client-grant. De eigenlijke login-blokkade loopt via een Auth Admin-ban in de aanroepende route (/api/account/delete), niet via deze kolom.';

-- security definer, niet via losse client-updates: moet atomisch en
-- role-afhankelijk zijn (barber raakt andere kolommen dan klant), en
-- deleted_at zelf krijgt bewust geen kolom-grant (zelfde "alleen de
-- functie mag dit zetten"-patroon als rating_avg/rating_count, 0003).
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd.';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Profiel niet gevonden.';
  end if;

  update public.profiles
  set full_name = 'Verwijderd account',
      phone = null,
      -- Klant: hergebruikt de bestaande schorsings-kolom (0016) als
      -- generiek "geen actieve gebruiker meer"-signaal — geen nieuwe
      -- kolom/enum-waarde nodig. Barber krijgt hieronder barber_status
      -- = 'suspended' voor dezelfde reden (sluit 'm meteen uit van élke
      -- bestaande `barber_status = 'approved'`-check in de hele app,
      -- zie 0003/0005/0007/0027/0028/0039/0053 — zonder die checks één
      -- voor één te moeten aanpassen).
      suspended = case when v_role = 'customer' then true else suspended end,
      barber_status = case when v_role = 'barber' then 'suspended' else barber_status end,
      deleted_at = coalesce(deleted_at, now())
  where id = v_uid;

  if v_role = 'barber' then
    update public.barber_profiles
    set bio = null,
        kvk_number = null,
        city = null,
        address = null,
        portfolio_urls = '{}',
        insurance_doc_url = null,
        id_doc_url = null,
        iban = null,
        avatar_url = null,
        diploma_url = null,
        is_online = false
    where id = v_uid;
  elsif v_role = 'customer' then
    update public.customer_profiles
    set default_address = null
    where id = v_uid;
  end if;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;
