"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { AdminNoShowRow } from "@/lib/supabase/queries";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NoShowWarningsList({ rows }: { rows: AdminNoShowRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reinstate(barberId: string) {
    setBusyId(barberId);
    setError(null);
    const res = await fetch("/api/admin/barbers/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barberId, status: "approved" }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Herstellen is niet gelukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return <div className="text-[14px] text-text-secondary">Nog geen gemiste afspraken.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{error}</div>
      )}
      {rows.map((r) => {
        const suspended = r.barberStatus === "suspended";
        return (
          <div key={r.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{r.barberName}</span>
                <Badge variant={suspended ? "error" : "accent"}>
                  {suspended ? "Geschorst" : `Waarschuwing ${r.warningNumber}`}
                </Badge>
              </div>
              <div className="text-[13px] text-text-secondary mt-0.5">
                Klant: {r.customerName} · {r.serviceName}
                {r.scheduledAt && ` · Afspraak was gepland voor ${formatDateTime(r.scheduledAt)}`}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-[13px] text-text-tertiary">{formatDateTime(r.createdAt)}</div>
              {suspended && (
                <Button size="sm" variant="secondary" disabled={busyId === r.barberId} onClick={() => reinstate(r.barberId)}>
                  Herstel
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
