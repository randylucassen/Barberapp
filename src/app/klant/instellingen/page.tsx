"use client";
import { Bell, ChevronRight, CreditCard, MapPin, MessageCircle, Shield, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Dialog, NavBar, Switch } from "@/components/ui";
import { Row, SectionLabel } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push";

export default function SettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [push, setPush] = useState(false);
  const [mail, setMail] = useState(true);
  const [dlg, setDlg] = useState(false);
  const [deleteDlg, setDeleteDlg] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("email_notifications_enabled")
        .eq("id", data.user.id)
        .single();
      if (profile) setMail(profile.email_notifications_enabled);

      const { count } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.user.id);
      setPush((count ?? 0) > 0);
    })();
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
    router.push("/klant/login");
    router.refresh();
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error();
      await supabase.auth.signOut();
      router.push("/klant/login");
      router.refresh();
    } catch {
      setDeleteError("Verwijderen is niet gelukt. Probeer het opnieuw.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Instellingen" onBack={() => router.push("/klant/profiel")} />
      <div className="px-5 pt-2 flex-1 overflow-y-auto no-scrollbar">
        <SectionLabel>Account</SectionLabel>
        <Row
          left={<span className="text-primary"><User size={20} /></span>}
          title="Persoonlijke gegevens"
          sub="Naam, e-mail, telefoon"
          right={<ChevronRight size={18} />}
          onClick={() => router.push("/klant/gegevens")}
        />
        <Row
          left={<span className="text-primary"><MapPin size={20} /></span>}
          title="Adres"
          sub="Standaardadres voor boekingen"
          right={<ChevronRight size={18} />}
          onClick={() => router.push("/klant/adres")}
        />
        <Row left={<span className="text-primary"><CreditCard size={20} /></span>} title="Betaalmethoden" sub="Binnenkort beschikbaar" right={null} />
        <SectionLabel>Meldingen</SectionLabel>
        <Row left={<span className="text-primary"><Bell size={20} /></span>} title="Pushmeldingen" right={<Switch checked={push} onChange={handleTogglePush} />} />
        <Row left={<span className="text-primary"><MessageCircle size={20} /></span>} title="E-mailupdates" right={<Switch checked={mail} onChange={handleToggleMail} />} />
        <SectionLabel>Overig</SectionLabel>
        <Row left={<span className="text-primary"><Shield size={20} /></span>} title="Privacy en voorwaarden" right={null} />
        <div className="mt-6 mb-2">
          <Button full variant="secondary" onClick={() => setDlg(true)}>Uitloggen</Button>
        </div>
        <div className="mb-4">
          <Button full variant="ghost" onClick={() => setDeleteDlg(true)}>
            Account verwijderen
          </Button>
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
      <Dialog
        open={deleteDlg}
        title="Account verwijderen?"
        onClose={() => !deleting && setDeleteDlg(false)}
        actions={
          <>
            <Button full size="md" variant="secondary" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? "Bezig…" : "Verwijder mijn account"}
            </Button>
            <Button full size="md" variant="ghost" onClick={() => setDeleteDlg(false)} disabled={deleting}>
              Annuleer
            </Button>
          </>
        }
      >
        <>
          Je kunt hierna niet meer inloggen en je persoonlijke gegevens (naam, telefoon, adres) worden gewist. Dit
          kan niet ongedaan worden gemaakt. Je boekingsgeschiedenis blijft geanonimiseerd bewaard voor de
          barbers die je eerder boekte.
          {deleteError && <div className="mt-3 text-error-text text-[13px]">{deleteError}</div>}
        </>
      </Dialog>
    </div>
  );
}
