-- Fase 9: wallet (klant + barber), loyaliteitspunten, opwaarderen + bonus,
-- kortingscodes, referral-systeem. Abonnementen zitten hier bewust NIET
-- in (aparte, latere fase — zie PROJECT.md). De wallet is bewust
-- losstaand van het boekingsbetaalproces: walletsaldo kan geen boeking
-- betalen, boekingen blijven 100% via Stripe lopen (create-payment-intent
-- wordt hier alleen uitgebreid met een kortingscode-parameter, niet met
-- een wallet-aftrek) — zo raakt deze fase de al geteste escrow/refund/
-- geschil-flow uit Fase 6/7 zo min mogelijk aan.
--
-- Kernpatroon: wallets.balance_cents/loyalty_points zijn voor clients
-- alleen leesbaar. Elke mutatie loopt via security definer-functies die
-- de kolom updaten én een ledger-rij wegschrijven in dezelfde transactie
-- (credit_wallet), zodat balance en audit-trail nooit uit sync kunnen
-- raken door losse client-side updates.

-- ============================================================
-- Nieuwe enums
-- ============================================================

create type public.wallet_ledger_entry_type as enum (
  'topup', 'topup_bonus', 'loyalty_redemption',
  'referral_bonus_referrer', 'referral_bonus_referee'
);
create type public.loyalty_ledger_entry_type as enum ('earned', 'redeemed');
create type public.wallet_topup_status as enum ('pending', 'succeeded', 'failed');
create type public.discount_code_type as enum ('percentage', 'fixed');

alter type public.notification_type add value 'wallet_topup';
alter type public.notification_type add value 'referral_bonus';

-- ============================================================
-- wallets — 1 rij per profiel (klant én barber), auto-aangemaakt
-- ============================================================

create table public.wallets (
  id uuid primary key references public.profiles (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.wallets is
  'balance_cents/loyalty_points zijn alleen server-side muteerbaar (zie credit_wallet/redeem_loyalty_points) — geen insert/update-grant voor clients, dus geen losse client-side updates die uit sync kunnen raken met de ledger-tabellen.';

alter table public.wallets enable row level security;

create policy "Users can view own wallet"
  on public.wallets for select
  using (auth.uid() = id);

revoke all on public.wallets from anon, authenticated;
grant select on public.wallets to authenticated;

create function public.create_wallet_for_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (id) values (new.id);
  return new;
end;
$$;

create trigger on_profile_created_create_wallet
  after insert on public.profiles
  for each row execute procedure public.create_wallet_for_new_profile();

-- Backfill voor alle bestaande profielen (test-accounts uit Fase 1-8).
insert into public.wallets (id)
select id from public.profiles
on conflict do nothing;

-- ============================================================
-- Opwaarderen — wallet_topups + ledger
-- ============================================================

create table public.wallet_topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  bonus_cents integer not null default 0 check (bonus_cents >= 0),
  status public.wallet_topup_status not null default 'pending',
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  succeeded_at timestamptz
);

comment on table public.wallet_topups is
  'Client mag zelf alleen een pending-rij aanmaken (eigen sessie, vanuit /api/wallet/create-topup-intent) — de overgang naar succeeded gebeurt uitsluitend server-side (process_wallet_topup, aangeroepen vanuit de Stripe-webhook), geen update-grant voor authenticated.';

alter table public.wallet_topups enable row level security;

create policy "Users can view own topups"
  on public.wallet_topups for select
  using (auth.uid() = user_id);

create policy "Users can create own pending topup"
  on public.wallet_topups for insert
  with check (auth.uid() = user_id and status = 'pending');

revoke all on public.wallet_topups from anon, authenticated;
grant select, insert on public.wallet_topups to authenticated;

create table public.wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_type public.wallet_ledger_entry_type not null,
  amount_cents integer not null check (amount_cents > 0),
  balance_after_cents integer not null,
  related_topup_id uuid references public.wallet_topups (id),
  note text,
  created_at timestamptz not null default now()
);

alter table public.wallet_ledger_entries enable row level security;

create policy "Users can view own wallet ledger"
  on public.wallet_ledger_entries for select
  using (auth.uid() = user_id);

revoke all on public.wallet_ledger_entries from anon, authenticated;
grant select on public.wallet_ledger_entries to authenticated;

create table public.loyalty_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  entry_type public.loyalty_ledger_entry_type not null,
  points integer not null check (points > 0),
  points_balance_after integer not null,
  related_booking_id uuid references public.bookings (id),
  created_at timestamptz not null default now()
);

alter table public.loyalty_ledger_entries enable row level security;

create policy "Users can view own loyalty ledger"
  on public.loyalty_ledger_entries for select
  using (auth.uid() = user_id);

revoke all on public.loyalty_ledger_entries from anon, authenticated;
grant select on public.loyalty_ledger_entries to authenticated;

-- credit_wallet: het enige schrijfpad naar wallets.balance_cents. Bewust
-- GEEN execute-grant voor clients — een functie met een vrije
-- p_user_id-parameter zou anders misbruikt worden om jezelf (of iemand
-- anders) te crediteren. Alleen intern aangeroepen door de functies
-- hieronder; dat werkt zonder extra grants omdat Postgres bij een
-- geneste aanroep de rechten van de aanroepende functie-eigenaar
-- gebruikt, niet die van de oorspronkelijke gebruiker.
create function public.credit_wallet(
  p_user_id uuid,
  p_amount_cents integer,
  p_entry_type public.wallet_ledger_entry_type,
  p_related_topup_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance integer;
begin
  update public.wallets
  set balance_cents = balance_cents + p_amount_cents, updated_at = now()
  where id = p_user_id
  returning balance_cents into v_new_balance;

  insert into public.wallet_ledger_entries
    (user_id, entry_type, amount_cents, balance_after_cents, related_topup_id, note)
  values
    (p_user_id, p_entry_type, p_amount_cents, v_new_balance, p_related_topup_id, p_note);
end;
$$;

revoke execute on function
  public.credit_wallet(uuid, integer, public.wallet_ledger_entry_type, uuid, text)
  from public, anon, authenticated;

create function public.process_wallet_topup(p_topup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_amount integer;
  v_bonus integer;
  v_status public.wallet_topup_status;
begin
  select user_id, amount_cents, bonus_cents, status
  into v_user_id, v_amount, v_bonus, v_status
  from public.wallet_topups
  where id = p_topup_id
  for update;

  if v_status is distinct from 'pending' then
    return; -- idempotent bij een webhook-retry
  end if;

  update public.wallet_topups
  set status = 'succeeded', succeeded_at = now()
  where id = p_topup_id;

  perform public.credit_wallet(v_user_id, v_amount, 'topup', p_topup_id, 'Opwaardering');

  if v_bonus > 0 then
    perform public.credit_wallet(v_user_id, v_bonus, 'topup_bonus', p_topup_id, 'Opwaardeer-bonus');
  end if;

  insert into public.notifications (user_id, type, title, body)
  values (
    v_user_id,
    'wallet_topup',
    'Wallet opgewaardeerd',
    'Je saldo is aangevuld met €' || to_char(v_amount / 100.0, 'FM999990.00') ||
    case when v_bonus > 0 then ' + €' || to_char(v_bonus / 100.0, 'FM999990.00') || ' bonus' else '' end || '.'
  );
end;
$$;

comment on function public.process_wallet_topup(uuid) is
  'Aangeroepen vanuit de Stripe-webhook zodra een wallet-topup-payment-intent succeeded is. Geen execute-grant voor authenticated/anon — de service-role client (webhook) heeft impliciet volledige toegang, zelfde precedent als de payments-tabel.';

revoke execute on function public.process_wallet_topup(uuid) from public, anon, authenticated;

-- ============================================================
-- Loyaliteitspunten — verdienen (alleen klanten) + inwisselen
-- ============================================================

create function public.award_loyalty_points_for_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer;
  v_new_total integer;
begin
  -- 1 punt per volledige euro brutoprijs. Alleen klanten verdienen
  -- punten: barbers worden al direct uitbetaald via escrow, punten
  -- daarbovenop zou een verkapte tweede commissie-verlaging zijn zonder
  -- duidelijk doel. Moet in sync blijven met LOYALTY_POINTS_PER_EURO_SPENT
  -- in src/lib/wallet.ts (alleen voor UI-preview, dit is de bron van
  -- waarheid) — zelfde geaccepteerde duplicatie-precedent als het
  -- 24-uurs-venster tussen release-escrow/route.ts en deze migraties.
  v_points := floor(new.price_cents_snapshot / 100.0);
  if v_points <= 0 then
    return new;
  end if;

  update public.wallets
  set loyalty_points = loyalty_points + v_points
  where id = new.customer_id
  returning loyalty_points into v_new_total;

  insert into public.loyalty_ledger_entries
    (user_id, entry_type, points, points_balance_after, related_booking_id)
  values
    (new.customer_id, 'earned', v_points, v_new_total, new.id);

  return new;
end;
$$;

-- Bewust een nieuwe, losse after-update-trigger (naast de bestaande
-- before-update-statusmachine-trigger uit 0005/0009) — geen aanraking
-- van check_booking_status_transition(), dus geen regressierisico op die
-- al geteste functie.
create trigger on_booking_completed_award_loyalty
  after update on public.bookings
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute procedure public.award_loyalty_points_for_booking();

create function public.redeem_loyalty_points(p_points integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_new_points integer;
  v_cents integer;
begin
  if p_points < 500 then
    raise exception 'Minimaal 500 punten (€5) per keer inwisselen';
  end if;

  select loyalty_points into v_current from public.wallets where id = auth.uid();
  if v_current is null or v_current < p_points then
    raise exception 'Onvoldoende punten';
  end if;

  v_cents := p_points; -- 1 punt = 1 cent

  update public.wallets
  set loyalty_points = loyalty_points - p_points
  where id = auth.uid()
  returning loyalty_points into v_new_points;

  insert into public.loyalty_ledger_entries (user_id, entry_type, points, points_balance_after)
  values (auth.uid(), 'redeemed', p_points, v_new_points);

  perform public.credit_wallet(auth.uid(), v_cents, 'loyalty_redemption', null, 'Punten ingewisseld');
end;
$$;

comment on function public.redeem_loyalty_points(integer) is
  'Mag wel authenticated-execute krijgen (in tegenstelling tot credit_wallet) omdat hij intern auth.uid() gebruikt i.p.v. een user-id-parameter — een gebruiker kan dus nooit voor een ander inwisselen.';

grant execute on function public.redeem_loyalty_points(integer) to authenticated;

-- ============================================================
-- Referral-systeem
-- ============================================================

alter table public.profiles add column referral_code text unique;
alter table public.profiles add column referred_by_id uuid references public.profiles (id);

-- Backfill voor bestaande profielen. Kleine, geaccepteerde kans op een
-- md5-botsing bij toeval (16^6 combinaties, verwaarloosbaar bij de
-- huidige testdata-omvang) — nieuwe registraties na deze migratie
-- gebruiken wel een unieke-check-loop, zie handle_new_user() hieronder.
update public.profiles
set referral_code = upper(substr(md5(id::text || clock_timestamp()::text), 1, 6))
where referral_code is null;

alter table public.profiles alter column referral_code set not null;

-- handle_new_user() (0001) uitgebreid: genereert een unieke referral_code
-- en zoekt een eventueel meegegeven code op. Zelfde extensiepatroon als
-- check_booking_status_transition() in 0009. Een ongeldige/lege code
-- faalt de registratie niet — referred_by_id blijft dan null.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_referrer_id uuid;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;

  select id into v_referrer_id
  from public.profiles
  where referral_code = upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));

  insert into public.profiles (id, role, full_name, email, phone, barber_status, referral_code, referred_by_id)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'role')::public.user_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    case
      when (new.raw_user_meta_data ->> 'role') = 'barber' then 'pending'::public.barber_status
      else null
    end,
    v_code,
    v_referrer_id
  );
  return new;
end;
$$;

create function public.award_referral_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
begin
  -- Alleen bij de EERSTE afgeronde boeking van de referee: een account
  -- registreren of zelfs betalen kost niets en bewijst geen echte klant,
  -- pas een daadwerkelijk afgeronde dienst wel. Idempotentie via de query
  -- zelf, geen extra kolom nodig — een boeking kan sowieso nooit
  -- tweemaal naar completed (bestaande statusmachine, 0005/0009).
  if exists (
    select 1 from public.bookings
    where customer_id = new.customer_id and status = 'completed' and id <> new.id
  ) then
    return new;
  end if;

  select referred_by_id into v_referrer_id from public.profiles where id = new.customer_id;
  if v_referrer_id is null then
    return new;
  end if;

  -- €5 / €5, hardcoded — moet in sync blijven met
  -- REFERRAL_REFERRER_BONUS_CENTS/REFERRAL_REFEREE_BONUS_CENTS in
  -- src/lib/wallet.ts (display-only daar, bron van waarheid hier).
  perform public.credit_wallet(v_referrer_id, 500, 'referral_bonus_referrer', null, 'Referral-bonus: vriend rondde eerste boeking af');
  perform public.credit_wallet(new.customer_id, 500, 'referral_bonus_referee', null, 'Welkomstbonus voor je eerste boeking');

  insert into public.notifications (user_id, type, title, body) values
    (v_referrer_id, 'referral_bonus', 'Referral-bonus ontvangen', '€5 bijgeschreven omdat je vriend zijn eerste boeking heeft afgerond.'),
    (new.customer_id, 'referral_bonus', 'Welkomstbonus ontvangen', '€5 bijgeschreven als welkomstbonus.');

  return new;
end;
$$;

create trigger on_booking_completed_award_referral_bonus
  after update on public.bookings
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute procedure public.award_referral_bonus();

comment on trigger on_booking_completed_award_referral_bonus on public.bookings is
  'Reageert alleen op bookings.customer_id — een referral waarbij de referee zelf barber wordt (supply-side) triggert bewust niets, genoteerd als vervolgpunt in PROJECT.md.';

create function public.get_my_referral_stats()
returns table (referral_code text, referred_count integer, total_bonus_cents integer)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.referral_code,
    (select count(*)::integer from public.profiles where referred_by_id = p.id),
    coalesce((
      select sum(amount_cents)::integer from public.wallet_ledger_entries
      where user_id = p.id and entry_type = 'referral_bonus_referrer'
    ), 0)
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.get_my_referral_stats() to authenticated;

-- ============================================================
-- Kortingscodes
-- ============================================================

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type public.discount_code_type not null,
  value integer not null check (value > 0),
  max_uses integer,
  uses_count integer not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint discount_codes_percentage_value_range
    check (discount_type <> 'percentage' or value <= 100)
);

comment on table public.discount_codes is
  'Geen adminpanel in deze fase (komt in Fase 10) — codes worden tot dan handmatig via de SQL Editor aangemaakt, zelfde precedent als de barber_status-goedkeuring. Geen enkele client-grant, alleen benaderbaar via preview_discount_code/redeem_discount_code.';

alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;

create table public.discount_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  discount_cents integer not null check (discount_cents > 0),
  created_at timestamptz not null default now(),
  constraint discount_code_redemptions_one_per_user unique (discount_code_id, user_id)
);

comment on constraint discount_code_redemptions_one_per_user on public.discount_code_redemptions is
  'Dwingt "eenmalig per gebruiker" af op databaseniveau — een echte constraint, niet een omzeilbare app-side check.';

alter table public.discount_code_redemptions enable row level security;

create policy "Users can view own redemptions"
  on public.discount_code_redemptions for select
  using (auth.uid() = user_id);

revoke all on public.discount_code_redemptions from anon, authenticated;
grant select on public.discount_code_redemptions to authenticated;

create function public.preview_discount_code(p_code text)
returns table (discount_type public.discount_code_type, value integer)
language sql
security definer
set search_path = public
stable
as $$
  select discount_type, value from public.discount_codes
  where code = upper(trim(p_code)) and active
    and valid_from <= now() and (valid_until is null or valid_until >= now())
    and (max_uses is null or uses_count < max_uses);
$$;

comment on function public.preview_discount_code(text) is
  'Side-effect-vrij (geen redemption-rij, geen uses_count-verhoging) — puur voor live "-€X"-feedback in de UI vóór het afrekenen.';

grant execute on function public.preview_discount_code(text) to authenticated;

create function public.redeem_discount_code(p_code text, p_booking_id uuid, p_total_cents integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_discount integer;
begin
  select * into v_row from public.discount_codes
  where code = upper(trim(p_code))
  for update;

  if v_row is null or not v_row.active
     or v_row.valid_from > now()
     or (v_row.valid_until is not null and v_row.valid_until < now())
     or (v_row.max_uses is not null and v_row.uses_count >= v_row.max_uses) then
    raise exception 'Ongeldige of verlopen kortingscode';
  end if;

  if exists (
    select 1 from public.discount_code_redemptions
    where discount_code_id = v_row.id and user_id = auth.uid()
  ) then
    raise exception 'Je hebt deze code al eens gebruikt';
  end if;

  v_discount := case when v_row.discount_type = 'percentage'
    then round(p_total_cents * v_row.value / 100.0)
    else v_row.value
  end;
  v_discount := least(v_discount, greatest(p_total_cents - 50, 0)); -- nooit onder Stripe's €0,50-minimum

  update public.discount_codes set uses_count = uses_count + 1 where id = v_row.id;

  insert into public.discount_code_redemptions (discount_code_id, user_id, booking_id, discount_cents)
  values (v_row.id, auth.uid(), p_booking_id, v_discount);

  return v_discount;
end;
$$;

comment on function public.redeem_discount_code(text, uuid, integer) is
  'p_total_cents komt van de Route Handler (server-berekend via computePriceBreakdown, nooit client-vertrouwd) — deze functie dupliceert de prijsberekening zelf dus niet. for update-lock op de code-rij maakt dit race-vrij bij twee gelijktijdige verzoeken met dezelfde code. Geaccepteerd randgeval: als paymentIntents.create() hierna alsnog faalt, blijft de code als gebruikt geregistreerd zonder dat er geld gevraagd is — zelfde risicoklasse als de al geaccepteerde broadcast-claim-race uit Fase 5.';

grant execute on function public.redeem_discount_code(text, uuid, integer) to authenticated;

-- ============================================================
-- payments — discount_cents, nodig zodat amount_cents blijft
-- overeenkomen met wat Stripe daadwerkelijk incasseerde na een
-- toegepaste korting (platform_fee_cents/barber_payout_cents blijven
-- ongewijzigd berekend uit price_cents_snapshot — het platform absorbeert
-- de korting uit de eigen marge, de barber-uitbetaling verandert niet)
-- ============================================================

alter table public.payments add column discount_cents integer not null default 0 check (discount_cents >= 0);
