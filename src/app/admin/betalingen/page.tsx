import { AdminShell } from "@/components/admin/AdminShell";
import { StatusFilter } from "@/components/admin/StatusFilter";
import { Badge } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { getPaymentsForAdmin } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import type { EscrowState } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "held", label: "Held" },
  { value: "releasing", label: "Releasing" },
  { value: "released", label: "Released" },
  { value: "refunded", label: "Refunded" },
  { value: "paid", label: "Paid" },
];

const ESCROW_VARIANT: Record<EscrowState, "accent" | "success" | "error" | "neutral"> = {
  held: "accent",
  releasing: "accent",
  released: "success",
  paid: "success",
  refunded: "error",
};

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const supabase = createServiceClient();
  const payments = await getPaymentsForAdmin(supabase, status ? (status as EscrowState) : undefined);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Betalingen</div>
      <StatusFilter basePath="/admin/betalingen" current={status ?? ""} options={STATUS_OPTIONS} />
      {payments.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Geen betalingen in deze weergave.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((p) => (
            <div key={p.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold">{p.serviceName}</div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  Totaal €{euro(p.amountCents)} · fee €{euro(p.platformFeeCents)} · payout €{euro(p.barberPayoutCents)}
                  {p.discountCents > 0 && ` · korting €${euro(p.discountCents)}`}
                </div>
              </div>
              <Badge variant={ESCROW_VARIANT[p.escrowState]}>{p.escrowState}</Badge>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
