-- Ondersteunt drie onderdelen van de nieuwe admin-geschillen/escrow-batch
-- (zie CLAUDE.md voor de volledige toelichting):
-- 1. Een "Oké!"-knop op de klant-statusbalk die een afgehandeld geschil
--    permanent verbergt zodra de klant 'm heeft gezien.
-- 2. (impliciet) de bestaande disputes.opened_at/bookings.address dekken
--    de nieuwe timestamp/locatie in het admin-geschillenvenster al —
--    geen schema-wijziging nodig daarvoor.

alter table public.disputes add column customer_acknowledged_at timestamptz;

comment on column public.disputes.customer_acknowledged_at is
  'Gezet door acknowledge_dispute() zodra de klant op "Oké!" klikt op de statusbalk (klant-home) voor een afgehandeld geschil — daarna toont de balk dit geschil niet meer.';

-- disputes is zelfde patroon als payments: "Alleen server-side/admin
-- schrijfbaar" (zie 0003), dus geen kale update-grant aan authenticated.
-- Deze RPC is de enige schrijftoegang voor de klant, en expliciet beperkt
-- tot alleen het acknowledged_at-veld op een al-afgehandeld eigen geschil.
create or replace function public.acknowledge_dispute(p_dispute_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.disputes d
  set customer_acknowledged_at = now()
  from public.bookings b
  where d.id = p_dispute_id
    and d.booking_id = b.id
    and b.customer_id = auth.uid()
    and d.status in ('resolved', 'dismissed')
    and d.customer_acknowledged_at is null;

  if not found then
    raise exception 'Geschil niet gevonden, niet van jou, of nog niet afgehandeld';
  end if;
end;
$$;

grant execute on function public.acknowledge_dispute(uuid) to authenticated;
