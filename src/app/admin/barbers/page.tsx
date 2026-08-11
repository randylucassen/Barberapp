import { AdminShell } from "@/components/admin/AdminShell";
import { BarbersTable } from "@/components/admin/BarbersTable";
import { StatusFilter } from "@/components/admin/StatusFilter";
import { createServiceClient } from "@/lib/supabase/service";
import { getBarbersForAdmin } from "@/lib/supabase/queries";
import type { BarberStatus } from "@/lib/types";

const STATUS_OPTIONS = [
  { value: "", label: "Alle statussen" },
  { value: "pending", label: "Pending (wachtrij)" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminBarbersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // Geen query-param = standaard de pending-wachtrij, niet "alles" —
  // dat is de dagelijkse taak van dit scherm. "Alle statussen" moet
  // bewust gekozen worden via het filter.
  const effectiveStatus = status ?? "pending";
  const supabase = createServiceClient();
  const barbers = await getBarbersForAdmin(
    supabase,
    effectiveStatus ? (effectiveStatus as BarberStatus) : undefined
  );

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Barbers</div>
      <div className="text-[14px] text-text-secondary mb-4">Standaard de pending-wachtrij als er geen filter gekozen is.</div>
      <StatusFilter basePath="/admin/barbers" current={effectiveStatus} options={STATUS_OPTIONS} />
      <BarbersTable barbers={barbers} />
    </AdminShell>
  );
}
