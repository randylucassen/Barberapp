import { AdminShell } from "@/components/admin/AdminShell";
import { DisputesTable } from "@/components/admin/DisputesTable";
import { createServiceClient } from "@/lib/supabase/service";
import { getDisputesForAdmin } from "@/lib/supabase/queries";

export default async function AdminDisputesPage() {
  const supabase = createServiceClient();
  const disputes = await getDisputesForAdmin(supabase);
  const open = disputes.filter((d) => d.status === "open");
  const resolved = disputes.filter((d) => d.status !== "open");

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Geschillen</div>
      <div className="text-[15px] font-semibold mb-2">Open ({open.length})</div>
      <DisputesTable disputes={open} />
      {resolved.length > 0 && (
        <>
          <div className="text-[15px] font-semibold mt-6 mb-2">Afgehandeld</div>
          <DisputesTable disputes={resolved} />
        </>
      )}
    </AdminShell>
  );
}
