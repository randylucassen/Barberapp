"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Select } from "@/components/ui";
import type { AdminDiscountCodeRow } from "@/lib/supabase/queries";

export function DiscountCodesPanel({ codes }: { codes: AdminDiscountCodeRow[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    const res = await fetch("/api/admin/discount-codes/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        discountType,
        value: Number(value),
        maxUses: maxUses ? Number(maxUses) : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Aanmaken is niet gelukt");
      setCreating(false);
      return;
    }
    setCode("");
    setValue("");
    setMaxUses("");
    setCreating(false);
    router.refresh();
  }

  async function toggle(discountCodeId: string, active: boolean) {
    setBusyId(discountCodeId);
    setError(null);
    const res = await fetch("/api/admin/discount-codes/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discountCodeId, active }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Actie is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="bg-white border border-border rounded-lg p-4 mb-6 flex items-end gap-3 flex-wrap">
        <Input label="Code" placeholder="WELKOM10" required value={code} onChange={(e) => setCode(e.target.value)} className="w-40" />
        <Select
          label="Type"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
          options={[
            { value: "percentage", label: "Percentage" },
            { value: "fixed", label: "Vast bedrag (centen)" },
          ]}
          className="w-44"
        />
        <Input label="Waarde" type="number" required value={value} onChange={(e) => setValue(e.target.value)} className="w-28" />
        <Input label="Max. gebruik (optioneel)" type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className="w-40" />
        <Button type="submit" disabled={creating}>
          {creating ? "Bezig…" : "Aanmaken"}
        </Button>
      </form>
      {error && (
        <div className="mb-4 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5">{error}</div>
      )}

      {codes.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Nog geen kortingscodes.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {codes.map((c) => (
            <div key={c.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">{c.code}</span>
                  <Badge variant={c.active ? "success" : "neutral"}>{c.active ? "actief" : "inactief"}</Badge>
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {c.discountType === "percentage" ? `${c.value}%` : `€${(c.value / 100).toFixed(2)}`} ·{" "}
                  {c.usesCount}/{c.maxUses ?? "∞"} gebruikt
                  {c.validUntil && ` · geldig t/m ${new Date(c.validUntil).toLocaleDateString("nl-NL")}`}
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => toggle(c.id, !c.active)}>
                {c.active ? "Deactiveren" : "Activeren"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
