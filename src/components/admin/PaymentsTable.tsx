"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { AdminPaymentRow } from "@/lib/supabase/queries";
import type { EscrowState } from "@/lib/types";
import { euro } from "@/lib/pricing";

const ESCROW_VARIANT: Record<EscrowState, "accent" | "success" | "error" | "neutral"> = {
  held: "accent",
  releasing: "accent",
  released: "success",
  paid: "success",
  refunded: "error",
};

export function PaymentsTable({ payments }: { payments: AdminPaymentRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  async function releaseNow(paymentId: string) {
    setBusyId(paymentId);
    setErrorById((cur) => ({ ...cur, [paymentId]: "" }));
    const res = await fetch("/api/admin/payments/release-escrow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setErrorById((cur) => ({ ...cur, [paymentId]: body?.error || "Vrijgeven is mislukt. Probeer het opnieuw." }));
      return;
    }
    router.refresh();
  }

  if (payments.length === 0) {
    return <div className="text-[14px] text-text-secondary">Geen betalingen in deze weergave.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {payments.map((p) => (
        <div key={p.id} className="bg-white border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold">{p.serviceName}</div>
              <div className="text-[13px] text-text-secondary mt-0.5">
                Totaal €{euro(p.amountCents)} · fee €{euro(p.platformFeeCents)} · payout €{euro(p.barberPayoutCents)}
                {p.discountCents > 0 && ` · korting €${euro(p.discountCents)}`}
              </div>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <Badge variant={ESCROW_VARIANT[p.escrowState]}>{p.escrowState}</Badge>
              {p.escrowState === "held" && (
                <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => releaseNow(p.id)}>
                  Nu vrijgeven
                </Button>
              )}
            </div>
          </div>
          {errorById[p.id] && (
            <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2 leading-[18px] mt-2.5">
              {errorById[p.id]}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
