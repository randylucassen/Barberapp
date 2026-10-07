import { AdminShell } from "@/components/admin/AdminShell";
import { BarbersTable } from "@/components/admin/BarbersTable";
import { StatusFilter } from "@/components/admin/StatusFilter";
import { UserSearch } from "@/components/admin/UserSearch";
import { createServiceClient } from "@/lib/supabase/service";
import { getBarbersForAdmin } from "@/lib/supabase/queries";
import type { BarberStatus } from "@/lib/types";

// "all" i.p.v. "" als sentinel voor "Alle statussen": StatusFilter zet
// een leeg/falsy value nooit in de URL (zie daar), dus zonder dit zou
// kiezen voor "Alle statussen" gewoon geen status-param meesturen — en
// dan verviel effectiveStatus hieronder alsnog terug naar "pending",
// precies de bug die hier zat.
const STATUS_OPTIONS = [
  { value: "all", label: "Alle statussen" },
  { value: "pending", label: "Pending (wachtrij)" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

export default async function AdminBarbersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;
  // Geen query-param = standaard de pending-wachtrij, niet "alles" —
  // dat is de dagelijkse taak van dit scherm. "Alle statussen" moet
  // bewust gekozen worden via het filter.
  const effectiveStatus = status ?? "pending";
  const supabase = createServiceClient();
  const barbers = await getBarbersForAdmin(
    supabase,
    effectiveStatus !== "all" ? (effectiveStatus as BarberStatus) : undefined,
    search
  );

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Barbers</div>
      <div className="text-[14px] text-text-secondary mb-4">Standaard de pending-wachtrij als er geen filter gekozen is.</div>
      <div className="flex gap-3 items-start">
        <StatusFilter
          basePath="/admin/barbers"
          current={effectiveStatus}
          options={STATUS_OPTIONS}
          extraParams={search ? { search } : undefined}
        />
        <UserSearch initial={search ?? ""} basePath="/admin/barbers" extraParams={{ status: effectiveStatus }} />
      </div>
      <BarbersTable barbers={barbers} />
    </AdminShell>
  );
}
