"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { MIN_SERVICE_PRICE_CENTS, euro } from "@/lib/pricing";

// Los bewerkscherm voor services — ontbrak tot nu toe volledig. De enige
// plek waar een barber diensten/prijzen kon zetten was stap 3 van
// /barber/aanmelden, en die doet bij elke indiening een destructieve
// "verwijder alles, voeg opnieuw in"-reset (incl. gegevens/verificatie-
// stappen opnieuw doorlopen) — onwerkbaar voor iets simpels als één
// prijs aanpassen. Dit scherm doet een gerichte diff i.p.v. een volledige
// reset: bestaande rijen (met een `id`) worden ge-update, nieuwe rijen
// ingevoegd, verwijderde rijen pas bij "Opslaan" daadwerkelijk
// verwijderd — zelfde "lokaal bewerken, pas bij Opslaan wegschrijven"-
// patroon als /barber/werkgebied en /barber/portfolio. Verwijderen van
// een service is altijd veilig, ook met bestaande boekingsgeschiedenis:
// bookings/booking_services snapshotten naam/prijs/duur bij het boeken
// (`price_cents_snapshot` e.d.) en service_id staat op `on delete set
// null` (zie 0003/0027) — een oude boeking verliest nooit zijn bedrag.
// Bewust geen "dienst toevoegen"-knop (gebruikerskeuze) — nieuwe
// diensten blijven alleen via de aanmeld-wizard aan te maken, dit
// scherm is puur voor bestaande diensten bewerken/verwijderen.
interface ServiceRow {
  id: string | null;
  name: string;
  durationMinutes: number;
  priceEuros: number;
}

function emptyRow(): ServiceRow {
  return { id: null, name: "", durationMinutes: 30, priceEuros: MIN_SERVICE_PRICE_CENTS / 100 };
}

export default function BarberDienstenPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: existing } = await supabase
        .from("services")
        .select("id, name, duration_minutes, price_cents")
        .eq("barber_id", data.user.id)
        .eq("active", true)
        .order("created_at", { ascending: true });
      setRows(
        existing && existing.length > 0
          ? existing.map((s) => ({
              id: s.id as string,
              name: s.name as string,
              durationMinutes: s.duration_minutes as number,
              priceEuros: (s.price_cents as number) / 100,
            }))
          : [emptyRow()]
      );
      setLoading(false);
    })();
  }, []);

  function updateRow(index: number, patch: Partial<ServiceRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const rowsValid = rows.every(
    (r) => r.name.trim() !== "" && r.durationMinutes > 0 && Math.round(r.priceEuros * 100) >= MIN_SERVICE_PRICE_CENTS
  );
  const formValid = rows.length > 0 && rowsValid;

  async function handleSave() {
    if (!userId || !formValid) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const { data: existingRows, error: fetchError } = await supabase
      .from("services")
      .select("id")
      .eq("barber_id", userId)
      .eq("active", true);
    if (fetchError) {
      setSaving(false);
      setError("Opslaan is niet gelukt. Probeer het opnieuw.");
      return;
    }
    const keptIds = new Set(rows.filter((r) => r.id).map((r) => r.id as string));
    const removedIds = (existingRows ?? []).map((r) => r.id as string).filter((id) => !keptIds.has(id));

    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase.from("services").delete().in("id", removedIds);
      if (deleteError) {
        setSaving(false);
        setError("Opslaan is niet gelukt. Probeer het opnieuw.");
        return;
      }
    }

    for (const r of rows) {
      const payload = {
        name: r.name.trim(),
        duration_minutes: r.durationMinutes,
        price_cents: Math.round(r.priceEuros * 100),
      };
      const { error: writeError } = r.id
        ? await supabase.from("services").update(payload).eq("id", r.id)
        : await supabase.from("services").insert({ ...payload, barber_id: userId });
      if (writeError) {
        setSaving(false);
        setError("Opslaan is niet gelukt. Probeer het opnieuw.");
        return;
      }
    }

    setSaving(false);
    router.push("/barber/profiel");
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Diensten en prijzen" onBack={() => router.push("/barber/profiel")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {!loading && (
          <>
            <div className="text-[14px] text-text-secondary leading-[21px]">
              Jouw diensten, jouw prijzen — alleen een minimum van €{euro(MIN_SERVICE_PRICE_CENTS)} per dienst, zodat
              niemand onder de kostprijs hoeft te werken.
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {rows.map((r, i) => {
                const belowMin = Math.round(r.priceEuros * 100) < MIN_SERVICE_PRICE_CENTS;
                return (
                  <div key={i} className="border border-border rounded-md p-3.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Naam dienst"
                          value={r.name}
                          onChange={(e) => updateRow(i, { name: e.target.value })}
                        />
                      </div>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          aria-label="Verwijder dienst"
                          onClick={() => removeRow(i)}
                          className="h-ctrl-md w-ctrl-md shrink-0 flex items-center justify-center text-text-tertiary"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={5}
                          value={r.durationMinutes}
                          onChange={(e) => updateRow(i, { durationMinutes: Number(e.target.value) })}
                          className="w-14 text-[13px] text-text-secondary border border-border rounded-sm px-1.5 py-1"
                        />
                        <span className="text-[13px] text-text-secondary">min</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[15px] font-semibold">€</span>
                          <input
                            type="number"
                            min={MIN_SERVICE_PRICE_CENTS / 100}
                            value={r.priceEuros}
                            onChange={(e) => updateRow(i, { priceEuros: Number(e.target.value) })}
                            className={`w-16 text-[15px] font-semibold border rounded-sm px-1.5 py-1 ${
                              belowMin ? "border-error text-error" : "border-border"
                            }`}
                          />
                        </div>
                        {belowMin && (
                          <span className="text-[11px] text-error">min. €{euro(MIN_SERVICE_PRICE_CENTS)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {error && (
              <div className="mt-4 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
                {error}
              </div>
            )}
          </>
        )}
      </div>
      <div className="px-5 pt-3 pb-2 border-t border-border bg-white">
        <Button full disabled={saving || !formValid} onClick={handleSave}>
          {saving ? "Bezig…" : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}
