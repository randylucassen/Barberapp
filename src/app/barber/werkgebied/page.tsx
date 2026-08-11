"use client";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { geocodeAddress, getBarberProfile, setBarberLocation } from "@/lib/supabase/queries";

export default function WorkAreaPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [city, setCity] = useState("je stad");
  const [r, setR] = useState(8);
  const [saving, setSaving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const barberProfile = await getBarberProfile(supabase, data.user.id);
      if (barberProfile) {
        setR(barberProfile.workAreaKm);
        if (barberProfile.city) setCity(barberProfile.city);
      }
    })();
  }, []);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setLocationError(null);
    const supabase = createClient();
    await supabase.from("barber_profiles").update({ work_area_km: r }).eq("id", userId);

    // Backfill/ververs lat/lng op basis van de stad — nodig zodat
    // automatische matching (Fase 5) deze barber kan vinden. De straal
    // zelf staat inmiddels al opgeslagen (hierboven), dus dit blokkeert
    // niet meer dan nodig.
    const geo = await geocodeAddress(city);
    setSaving(false);
    if (!geo) {
      setLocationError("Kon je stad niet automatisch lokaliseren — probeer het nog eens. Zonder locatie ontvang je geen automatisch-toegewezen aanvragen.");
      return;
    }
    await setBarberLocation(supabase, userId, geo.lat, geo.lng);
    router.push("/barber/profiel");
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Werkgebied" onBack={() => router.push("/barber/profiel")} />
      <div className="flex-1 bg-[#F1F3F4] relative min-h-[220px]">
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            style={{ width: 120 + r * 8, height: 120 + r * 8 }}
            className="rounded-full bg-accent/10 border-2 border-accent flex items-center justify-center transition-all duration-200"
          >
            <span className="text-accent"><MapPin size={28} /></span>
          </div>
        </div>
      </div>
      <div className="px-5 pt-5 pb-2 bg-white">
        <div className="flex justify-between items-baseline">
          <span className="text-[17px] font-semibold">Straal vanaf {city}</span>
          <span className="text-[20px] font-bold text-accent">{r} km</span>
        </div>
        <input
          type="range"
          min={2}
          max={25}
          value={r}
          onChange={(e) => setR(+e.target.value)}
          className="w-full mt-3.5 accent-accent"
        />
        <div className="text-[13px] text-text-secondary mt-2">Grotere straal = meer aanvragen, langere reistijden.</div>
        {locationError && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {locationError}
          </div>
        )}
        <div className="my-4">
          <Button full disabled={saving} onClick={handleSave}>{saving ? "Bezig…" : "Opslaan"}</Button>
        </div>
      </div>
    </div>
  );
}
