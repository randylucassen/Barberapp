"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { updatePersonalInfo } from "@/lib/supabase/queries";

export default function PersonalInfoPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      setEmail(data.user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", data.user.id)
        .single();
      if (profile) {
        setName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    if (!userId || !name.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    const ok = await updatePersonalInfo(supabase, userId, { fullName: name.trim(), phone: phone.trim() || null });
    setSaving(false);
    if (ok) {
      setSaved(true);
    } else {
      setError("Opslaan is niet gelukt. Probeer het opnieuw.");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Persoonlijke gegevens" onBack={() => router.push("/klant/instellingen")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {!loading && (
          <div className="flex flex-col gap-4">
            <Input label="Naam" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Telefoon" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optioneel" />
            <div>
              <Input label="E-mail" value={email} disabled />
              <div className="text-[12px] text-text-tertiary mt-1.5">
                Je e-mailadres wijzigen kan nog niet in de app — neem contact op als dit nodig is.
              </div>
            </div>
          </div>
        )}
        {saved && (
          <div className="mt-4 bg-success-soft text-success-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            Gegevens opgeslagen.
          </div>
        )}
        {error && (
          <div className="mt-4 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        )}
      </div>
      <div className="px-5 pt-3 pb-2">
        <Button full variant="accent" disabled={saving || loading || !name.trim()} onClick={handleSave}>
          {saving ? "Bezig…" : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}
