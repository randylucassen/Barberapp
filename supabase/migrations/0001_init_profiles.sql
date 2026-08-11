-- Fase 1: authenticatie & rollen (customer/barber).
-- Voer dit één keer uit in de Supabase SQL Editor van je project.

create type public.user_role as enum ('customer', 'barber');
create type public.barber_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  email text not null,
  phone text,
  barber_status public.barber_status,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Geen insert-policy voor clients: rijen ontstaan uitsluitend via de
-- trigger hieronder (security definer), niet via een directe client-insert.

-- Kolom-niveau lockdown, los van de row-policy hierboven: zonder dit zou een
-- ingelogde gebruiker via een gewone update-call op zijn eigen rij ook
-- role/barber_status kunnen wijzigen (self-promotion tot barber, of
-- zichzelf op "approved" zetten) — de RLS-policy checkt namelijk alleen
-- welke rij, niet welke kolommen. anon raakt de tabel nooit.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, onboarding_completed) on public.profiles to authenticated;

-- Maakt automatisch een profiles-rij aan zodra een gebruiker zich
-- registreert. De rol komt uit user_metadata, meegegeven bij signUp().
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email, phone, barber_status)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    case
      when (new.raw_user_meta_data ->> 'role') = 'barber' then 'pending'::public.barber_status
      else null
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
