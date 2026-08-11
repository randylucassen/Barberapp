"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { AdminStuckBookingRow } from "@/lib/supabase/queries";

function hoursSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000));
}

export function StuckBookingsTable({ bookings }: { bookings: AdminStuckBookingRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(bookingId: string, action: "complete" | "cancel") {
    setBusyId(bookingId);
    setError(null);
    const res = await fetch("/api/admin/bookings/force-resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, action }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Actie is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  if (bookings.length === 0) {
    return <div className="text-[14px] text-text-secondary">Geen vastgelopen boekingen.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{error}</div>
      )}
      {bookings.map((b) => (
        <div key={b.id} className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold">{b.serviceName}</span>
                <Badge variant="error">{b.status}</Badge>
              </div>
              <div className="text-[13px] text-text-secondary mt-0.5">
                Klant: {b.customerName} · Barber: {b.barberName}
              </div>
              <div className="text-[13px] text-text-secondary mt-0.5">
                Al {hoursSince(b.updatedAt)}u op deze status{b.escrowState ? ` · escrow: ${b.escrowState}` : ""}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <Button size="sm" variant="primary" disabled={busyId === b.id} onClick={() => resolve(b.id, "complete")}>
                Forceer voltooid
              </Button>
              <Button size="sm" variant="secondary" disabled={busyId === b.id} onClick={() => resolve(b.id, "cancel")}>
                Forceer annuleren + terugbetalen
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
