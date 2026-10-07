import { AdminShell } from "@/components/admin/AdminShell";
import { StatusFilter } from "@/components/admin/StatusFilter";
import { PaymentsTable } from "@/components/admin/PaymentsTable";
import { createServiceClient } from "@/lib/supabase/service";
import { getPaymentsForAdmin } from "@/lib/supabase/queries";
import type { EscrowState } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "held", label: "Held" },
  { value: "releasing", label: "Releasing" },
  { value: "released", label: "Released" },
  { value: "refunded", label: "Refunded" },
  { value: "paid", label: "Paid" },
];

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
      <PaymentsTable payments={payments} />
    </AdminShell>
  );
}
