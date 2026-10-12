-- Bug gevonden door de gebruiker: een pushmelding voor de barber-
-- account kwam ook binnen terwijl diegene op hetzelfde toestel was
-- ingelogd als klant en "uitgelogd" was bij barber.
--
-- Oorzaak: registerForPushNotifications() (KPPRTJE-app, push-
-- notifications.ts) zet het Expo-token van het toestel gewoon op
-- profiles.expo_push_token van de net ingelogde gebruiker — maar wist
-- dat token NIET bij een eventuele ANDERE profiel-rij die het toestel
-- eerder al had geregistreerd. AuthProvider.signOut() wist het token
-- wél bij een bewuste "Uitloggen"-tik (0051-commentaar legt dat al uit),
-- maar dat dekt niet elk geval waarop iemand zonder die knop van
-- account wisselt op hetzelfde toestel (bv. de sessie verloopt vanzelf,
-- de app wordt geforceerd gesloten, of iemand schakelt via de klant-/
-- barber-appkiezer zonder expliciet uit te loggen) — zo kon hetzelfde
-- toestel-token op twee profielen tegelijk blijven staan, en kreeg de
-- ene rol dus ook meldingen die voor de andere rol bedoeld waren.
--
-- Fix: één RPC die het token "claimt" — wist 'm eerst bij elke ANDERE
-- profiel-rij die 'm nog heeft, zet 'm dan pas op de aanroepende
-- gebruiker. Security definer nodig: de bestaande "Users can update own
-- profile"-RLS-policy (0001) staat een update op een ANDERE rij sowieso
-- nooit toe, ook niet alleen voor deze kolom (0051's kolom-grant regelt
-- alleen welke kolom, niet welke rij). Dit maakt het zelf-herstellend,
-- ongeacht hoe de vorige sessie eindigde.
create function public.claim_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Ongeldig token';
  end if;

  update public.profiles
  set expo_push_token = null
  where expo_push_token = p_token and id <> auth.uid();

  update public.profiles
  set expo_push_token = p_token
  where id = auth.uid();
end;
$$;

comment on function public.claim_push_token(text) is
  'Zet het Expo-push-token van dit toestel op de ingelogde gebruiker, en wist datzelfde token eerst bij elke andere profiel-rij die het nog had (zelfde toestel, eerdere sessie als een andere rol/account) — voorkomt dat een pushmelding voor de verkeerde rol/account binnenkomt. Aangeroepen door registerForPushNotifications() (KPPRTJE-app) i.p.v. een kale update van de eigen rij.';

grant execute on function public.claim_push_token(text) to authenticated;
