import { AdminShell } from "@/components/admin/AdminShell";
import { NoShowWarningsList } from "@/components/admin/NoShowWarningsList";
import { createServiceClient } from "@/lib/supabase/service";
import { getNoShowWarningsForAdmin } from "@/lib/supabase/queries";

export default async function AdminNoShowsPage() {
  const supabase = createServiceClient();
  const rows = await getNoShowWarningsForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Gemiste afspraken</div>
      <div className="text-[13px] text-text-secondary mb-4">
        Automatisch geannuleerde boekingen omdat de barber niet binnen 60 minuten na de afgesproken tijd bevestigde
        onderweg te zijn. Bij een 2e waarschuwing wordt de barber automatisch geschorst — je kunt dat hieronder
        direct terugdraaien.
      </div>
      <NoShowWarningsList rows={rows} />
    </AdminShell>
  );
}
