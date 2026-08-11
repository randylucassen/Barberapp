"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, NavBar, Switch } from "@/components/ui";
import { Row } from "@/components/shared";
import { DAY_LABELS } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile } from "@/lib/supabase/queries";
import type { Availability } from "@/lib/types";

const DEFAULT_AVAILABILITY: Availability = {
  Ma: true, Di: true, Wo: true, Do: true, Vr: true, Za: true, Zo: false,
};

// Vaste weekvolgorde om op te renderen — Postgres JSONB garandeert geen
// sleutelvolgorde, dus Object.keys(days) zou na een save alfabetisch
// terugkomen i.p.v. Ma..Zo.
const DAY_ORDER: (keyof Availability)[] = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function AvailabilityPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [days, setDays] = useState<Availability>(DEFAULT_AVAILABILITY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const barberProfile = await getBarberProfile(supabase, data.user.id);
      if (barberProfile) setDays(barberProfile.availability);
    })();
  }, []);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("barber_profiles").update({ availability: days }).eq("id", userId);
    router.push("/barber/profiel");
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Beschikbaarheid" onBack={() => router.push("/barber/profiel")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {DAY_ORDER.map((d) => (
          <Row
            key={d}
            title={DAY_LABELS[d]}
            sub={days[d] ? "09:00 – 18:00" : "Niet beschikbaar"}
            right={<Switch checked={days[d]} onChange={(v) => setDays({ ...days, [d]: v })} />}
          />
        ))}
        <div className="mt-4 bg-surface rounded-md px-4 py-3 text-[13px] text-text-secondary leading-[19px]">
          Buiten deze tijden ontvang je geen directe aanvragen. Geplande boekingen kun je altijd handmatig accepteren.
        </div>
      </div>
      <div className="px-5 pt-3 pb-2">
        <Button full disabled={saving} onClick={handleSave}>{saving ? "Bezig…" : "Opslaan"}</Button>
      </div>
    </div>
  );
}
