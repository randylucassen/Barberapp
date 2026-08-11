-- Fase 9 bugfix (gevonden tijdens E2E-testen): process_wallet_topup()
-- gebruikte to_char(..., 'FM999990.00'), wat altijd een punt als
-- decimaalteken geeft ("€100.00") — inconsistent met de rest van de
-- Nederlandstalige UI, die overal een komma gebruikt (zie euro() in
-- src/lib/pricing.ts). Vervangt de punt door een komma in de
-- notificatietekst.

create or replace function public.process_wallet_topup(p_topup_id uuid)
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
    'Je saldo is aangevuld met €' || replace(to_char(v_amount / 100.0, 'FM999990.00'), '.', ',') ||
    case when v_bonus > 0 then ' + €' || replace(to_char(v_bonus / 100.0, 'FM999990.00'), '.', ',') || ' bonus' else '' end || '.'
  );
end;
$$;

revoke execute on function public.process_wallet_topup(uuid) from public, anon, authenticated;
