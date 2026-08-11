"use client";
import { Bell, Calendar, CreditCard, MapPin, MessageCircle, Scissors, Star, Wallet as WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Dialog, NavBar, Switch } from "@/components/ui";
import { Avatar, Row, SectionLabel } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile, getWallet } from "@/lib/supabase/queries";
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
    await supabase.auth.signOut();
    router.push("/barber/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Profiel" />
      <div className="px-5 pt-5 flex-1 overflow-y-auto no-scrollbar">
        <div className="flex gap-3.5 items-center">
          <Avatar name={name} size={64} dark />
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
        <div className="mt-6">
          <Row left={<span className="text-primary"><Scissors size={20} /></span>} title="Diensten en prijzen" sub={servicesLabel ?? "…"} />
          <Row
            left={<span className="text-primary"><MapPin size={20} /></span>}
            title="Werkgebied"
            sub={profile ? `${profile.city ?? "Onbekend"} · straal ${profile.workAreaKm} km` : "…"}
            onClick={() => router.push("/barber/werkgebied")}
          />
          <Row
            left={<span className="text-primary"><CreditCard size={20} /></span>}
            title="Uitbetaling"
            sub={payoutsEnabled ? "Wekelijks · Stripe gekoppeld" : "Nog niet gekoppeld"}
            onClick={() => router.push("/barber/uitbetalingen")}
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
