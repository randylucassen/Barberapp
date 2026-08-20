"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";
import { Badge, Button } from "@/components/ui";
import type { AdminBarberRow } from "@/lib/supabase/queries";

const STATUS_VARIANT: Record<string, "success" | "accent" | "error" | "neutral"> = {
  approved: "success",
  pending: "accent",
  rejected: "error",
  suspended: "error",
};

export function BarbersTable({ barbers }: { barbers: AdminBarberRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(barberId: string, status: string) {
    setBusyId(barberId);
    setError(null);
    const res = await fetch("/api/admin/barbers/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId, status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Actie is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  if (barbers.length === 0) {
    return <div className="text-[14px] text-text-secondary">Geen barbers in deze weergave.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{error}</div>
      )}
      {barbers.map((b) => {
        // Zelfde velden als de server-side goedkeuringscheck in
        // /api/admin/barbers/status — hier alleen om de admin vooraf te
        // laten zien wat er mist, i.p.v. pas na een mislukte klik.
        const missingFields = [
          !b.address?.trim() && "adres",
          !b.city?.trim() && "stad",
          !b.kvkNumber?.trim() && "KvK-nummer",
        ].filter((f): f is string => !!f);
        const canApprove = missingFields.length === 0;

        return (
          <div key={b.id} className="bg-white border border-border rounded-lg p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">{b.fullName}</span>
                  <Badge variant={STATUS_VARIANT[b.barberStatus ?? "pending"]}>{b.barberStatus}</Badge>
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {b.email} · {b.city ?? "geen stad"} · KvK {b.kvkNumber ?? "onbekend"}
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">{b.address ?? "geen adres"}</div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {b.ratingAvg ? `${b.ratingAvg.toFixed(1)} · ${b.ratingCount} reviews` : "Nog geen reviews"}
                </div>
                {!canApprove && b.barberStatus !== "approved" && (
                  <div className="text-[12px] text-error mt-1.5">Mist nog: {missingFields.join(", ")} — kan pas goedgekeurd worden na aanvullen.</div>
                )}
                {b.portfolioUrls.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {b.portfolioUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="w-14 h-14 rounded-md overflow-hidden bg-surface block relative">
                        <Image src={url} alt="Portfolio" fill className="object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2 text-[13px]">
                  {b.idDocUrl && <a href={b.idDocUrl} target="_blank" rel="noreferrer" className="text-accent underline">ID-bewijs</a>}
                  {b.insuranceDocUrl && <a href={b.insuranceDocUrl} target="_blank" rel="noreferrer" className="text-accent underline">Verzekering</a>}
                  {b.diplomaUrl && <a href={b.diplomaUrl} target="_blank" rel="noreferrer" className="text-accent underline">Diploma</a>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busyId === b.id || b.barberStatus === "approved" || !canApprove}
                  title={!canApprove ? `Mist nog: ${missingFields.join(", ")}` : undefined}
                  onClick={() => setStatus(b.id, "approved")}
                >
                  Goedkeuren
                </Button>
                <Button size="sm" variant="secondary" disabled={busyId === b.id || b.barberStatus === "rejected"} onClick={() => setStatus(b.id, "rejected")}>
                  Afkeuren
                </Button>
                <Button size="sm" variant="ghost" disabled={busyId === b.id || b.barberStatus === "suspended"} onClick={() => setStatus(b.id, "suspended")}>
                  Schorsen
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
