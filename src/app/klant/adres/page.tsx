"use client";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, NavBar } from "@/components/ui";
import { AddressAutocomplete } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getCustomerProfile, updateDefaultAddress } from "@/lib/supabase/queries";

export default function AddressPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
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
      const profile = await getCustomerProfile(supabase, data.user.id);
      if (profile?.defaultAddress) setAddress(profile.defaultAddress);
      setLoading(false);
    })();
  }, []);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    const ok = await updateDefaultAddress(supabase, userId, address.trim());
    setSaving(false);
    if (ok) {
      setSaved(true);
    } else {
      setError("Opslaan is niet gelukt. Probeer het opnieuw.");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Adres" onBack={() => router.push("/klant/instellingen")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="text-[13px] text-text-secondary mb-3">
          Dit adres wordt automatisch ingevuld als je een boeking start — je kan het daar altijd nog aanpassen.
        </div>
        {!loading && (
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Straat en huisnummer, plaats"
            leading={<span className="flex text-text-tertiary"><MapPin size={18} /></span>}
            className="flex items-center gap-2.5 h-ctrl-md px-4 rounded-md bg-surface transition-shadow duration-fast ease-groomy focus-within:shadow-focus-ring border border-transparent"
            inputClassName="flex-1 min-w-0 border-none outline-none bg-transparent font-sans text-[17px] text-text-primary placeholder:text-text-tertiary"
          />
        )}
        {saved && (
          <div className="mt-3 bg-success-soft text-success-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            Adres opgeslagen.
          </div>
        )}
        {error && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        )}
      </div>
      <div className="px-5 pt-3 pb-2">
        <Button full variant="accent" disabled={saving || loading} onClick={handleSave}>
          {saving ? "Bezig…" : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}
