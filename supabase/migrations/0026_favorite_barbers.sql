-- Favoriete barbers — klant kan een barber markeren na een goede
-- ervaring (review-scherm) of los vanuit de barberlijst, en ziet ze
-- terug onder klant/barbers -> "Favorieten" (nieuwe 3e tab, naast "Nu"
-- en "Boek vooruit", zie 0027 voor de rename van "Gepland").
create table public.customer_favorite_barbers (
  customer_id uuid not null references public.profiles (id) on delete cascade,
  barber_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (customer_id, barber_id)
);

comment on table public.customer_favorite_barbers is
  'Puur een klant-eigen bladwijzer op een barber — geen enkele invloed op matching/RLS elders, alleen gebruikt om klant/barbers -> Favorieten te vullen.';

alter table public.customer_favorite_barbers enable row level security;

create policy "Customers manage own favorites"
  on public.customer_favorite_barbers for all
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

grant select, insert, delete on public.customer_favorite_barbers to authenticated;
