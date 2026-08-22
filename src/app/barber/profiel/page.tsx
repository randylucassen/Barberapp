"use client";
import { Bell, Calendar, Camera, CreditCard, FileText, MapPin, MessageCircle, Scissors, Star, Wallet as WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Button, Dialog, NavBar, Switch } from "@/components/ui";
import { Avatar, Row, SectionLabel } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile, getWallet, setBarberOnline } from "@/lib/supabase/queries";
import { uploadBarberFile } from "@/lib/supabase/storage";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { euro } from "@/lib/pricing";
import type { BarberProfile } from "@/lib/types";

const DAY_ORDER = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"] as const;

function summarizeAvailability(profile: BarberProfile | null): string {
  if (!profile) return "…";
  const activeDays = DAY_ORDER.filter((d) => profile.availability[d]);
  if (activeDays.length === 0) return "Geen dagen ingesteld";
  return `${activeDays.join(", ")} · 09:00–18:00`;
}

export default function BarberProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dlg, setDlg] = useState(false);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [profile, setProfile] = useState<BarberProfile | null>(null);
  const [push, setPush] = useState(false);
  const [mail, setMail] = useState(true);
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null);
  const [ridesCount, setRidesCount] = useState<number | null>(null);
  const [servicesLabel, setServicesLabel] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      setName((data.user.user_metadata?.full_name as string) ?? "");
      const p = await getBarberProfile(supabase, data.user.id);
      setPayoutsEnabled(p?.stripePayoutsEnabled ?? false);
      setProfile(p);

      const wallet = await getWallet(supabase, data.user.id);
      setWalletBalanceCents(wallet?.balanceCents ?? 0);

      const { data: prof } = await supabase
        .from("profiles")
        .select("email_notifications_enabled")
        .eq("id", data.user.id)
        .single();
      if (prof) setMail(prof.email_notifications_enabled);

      const { count } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.user.id);
      setPush((count ?? 0) > 0);

      const { count: completedCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("barber_id", data.user.id)
        .eq("status", "completed");
      setRidesCount(completedCount ?? 0);

      const { data: servicesRows } = await supabase
        .from("services")
        .select("name, price_cents")
        .eq("barber_id", data.user.id)
        .eq("active", true)
        .order("created_at", { ascending: true });
      if (servicesRows && servicesRows.length > 0) {
        const preview = servicesRows
          .slice(0, 2)
          .map((s) => `${s.name} €${(s.price_cents / 100).toFixed(0)}`)
          .join(" · ");
        const extra = servicesRows.length > 2 ? ` · +${servicesRows.length - 2} meer` : "";
        setServicesLabel(`${preview}${extra}`);
      } else {
        setServicesLabel("Nog geen diensten ingesteld");
      }
    });
  }, []);

  async function handleAvatarSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setAvatarUploading(true);
    setAvatarError(null);
    const supabase = createClient();
    try {
      const url = await uploadBarberFile(supabase, "barber-media", userId, `avatar-${Date.now()}-${file.name}`, file);
      const { error } = await supabase.from("barber_profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, avatarUrl: url } : prev));
    } catch {
      setAvatarError("Profielfoto bijwerken is niet gelukt. Probeer het opnieuw.");
    } finally {
      setAvatarUploading(false);
      e.target.value = "";
    }
  }

  async function handleTogglePush(next: boolean) {
    if (!userId) return;
    setPush(next);
    const supabase = createClient();
    const ok = next ? await subscribeToPush(supabase, userId) : await unsubscribeFromPush(supabase);
    if (!ok) setPush(!next);
  }

  async function handleToggleMail(next: boolean) {
    if (!userId) return;
    setMail(next);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ email_notifications_enabled: next })
      .eq("id", userId);
    if (error) setMail(!next);
  }

  async function handleLogout() {
    setDlg(false);
    const supabase = createClient();
    // Meteen offline zetten i.p.v. te wachten tot de 90s-heartbeat-
    // staleness (barber/layout.tsx) dit vanzelf oplost — voorkomt dat de
    // klant een net-uitgelogde barber nog even als online ziet.
    if (userId) await setBarberOnline(supabase, userId, false);
    await supabase.auth.signOut();
    router.push("/barber/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Profiel" />
      <div className="px-5 pt-5 flex-1 overflow-y-auto no-scrollbar">
        <div className="flex gap-3.5 items-center">
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelected} />
          <button
            type="button"
            aria-label="Profielfoto wijzigen"
            onClick={() => !avatarUploading && avatarInputRef.current?.click()}
            className="relative flex-shrink-0"
          >
            <Avatar name={name} size={64} dark imageUrl={profile?.avatarUrl} />
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center border-2 border-white">
              <Camera size={12} />
            </span>
          </button>
          <div>
            <div className="text-[20px] font-bold tracking-[-0.01em]">{name}</div>
            <div className="flex items-center gap-1 text-[13px] text-text-secondary mt-0.5">
              <span className="text-primary flex"><Star size={13} fill="currentColor" /></span>
              <span className="font-semibold text-primary">
                {profile?.ratingAvg ? profile.ratingAvg.toFixed(1).replace(".", ",") : "–"}
              </span>
              <span>· {ridesCount ?? "…"} boekingen</span>
            </div>
          </div>
        </div>
        {avatarUploading && <div className="text-[12px] text-text-tertiary mt-2">Foto uploaden…</div>}
        {avatarError && (
          <div className="mt-2 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{avatarError}</div>
        )}
        <div className="mt-6">
          <Row left={<span className="text-primary"><Scissors size={20} /></span>} title="Diensten en prijzen" sub={servicesLabel ?? "…"} />
          <Row
            left={<span className="text-primary"><Camera size={20} /></span>}
            title="Portfolio"
            sub="Foto's die klanten zien vóór het boeken"
            onClick={() => router.push("/barber/portfolio")}
          />
          <Row
            left={<span className="text-primary"><MapPin size={20} /></span>}
            title="Werkgebied"
            sub={profile ? `${profile.city ?? "Onbekend"} · straal ${profile.workAreaKm} km` : "…"}
            onClick={() => router.push("/barber/werkgebied")}
          />
          <Row
            left={<span className="text-primary"><CreditCard size={20} /></span>}
            title="Uitbetaling"
            sub={payoutsEnabled ? "Binnen 24u · Stripe gekoppeld" : "Nog niet gekoppeld"}
            onClick={() => router.push("/barber/uitbetalingen")}
          />
          <Row
            left={<span className="text-primary"><FileText size={20} /></span>}
            title="Facturen"
            sub="Maandelijkse btw-factuur servicekosten"
            onClick={() => router.push("/barber/facturen")}
          />
          <Row
            left={<span className="text-primary"><WalletIcon size={20} /></span>}
            title="Wallet"
            sub={walletBalanceCents !== null ? `€${euro(walletBalanceCents)} saldo` : "…"}
            onClick={() => router.push("/barber/wallet")}
          />
          <Row
            left={<span className="text-primary"><Calendar size={20} /></span>}
            title="Beschikbaarheid"
            sub={summarizeAvailability(profile)}
            onClick={() => router.push("/barber/beschikbaarheid")}
          />
          <Row
            left={<span className="text-primary"><Star size={20} /></span>}
            title="Reviews"
            sub={profile?.ratingAvg ? `${profile.ratingAvg.toFixed(1).replace(".", ",")} · ${profile.ratingCount} reviews` : "Nog geen reviews"}
            onClick={() => router.push("/barber/reviews")}
          />
        </div>
        <SectionLabel>Meldingen</SectionLabel>
        <Row left={<span className="text-primary"><Bell size={20} /></span>} title="Pushmeldingen" right={<Switch checked={push} onChange={handleTogglePush} />} />
        <Row left={<span className="text-primary"><MessageCircle size={20} /></span>} title="E-mailupdates" right={<Switch checked={mail} onChange={handleToggleMail} />} />
        <div className="mt-6 mb-4">
          <Button full variant="secondary" onClick={() => setDlg(true)}>Uitloggen</Button>
        </div>
      </div>
      <Dialog
        open={dlg}
        title="Uitloggen?"
        onClose={() => setDlg(false)}
        actions={
          <>
            <Button full size="md" onClick={handleLogout}>Log uit</Button>
            <Button full size="md" variant="ghost" onClick={() => setDlg(false)}>Annuleer</Button>
          </>
        }
      >
        Je kunt altijd weer inloggen met je e-mailadres.
      </Dialog>
    </div>
  );
}
