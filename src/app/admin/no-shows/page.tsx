import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { getNoShowWarningsForAdmin } from "@/lib/supabase/queries";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminNoShowsPage() {
  const supabase = createServiceClient();
  const rows = await getNoShowWarningsForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Gemiste afspraken</div>
      <div className="text-[13px] text-text-secondary mb-4">
        Automatisch geannuleerde boekingen omdat de barber niet binnen 60 minuten na de afgesproken tijd bevestigde
        onderweg te zijn. Bij een 2e waarschuwing wordt de barber automatisch geschorst.
      </div>
      {rows.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Nog geen gemiste afspraken.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-semibold">{r.barberName}</span>
                  <Badge variant={r.warningNumber >= 2 ? "error" : "accent"}>
                    {r.warningNumber >= 2 ? "Geschorst" : `Waarschuwing ${r.warningNumber}`}
                  </Badge>
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  Klant: {r.customerName} · {r.serviceName}
                  {r.scheduledAt && ` · Afspraak was gepland voor ${formatDateTime(r.scheduledAt)}`}
                </div>
              </div>
              <div className="text-[13px] text-text-tertiary flex-shrink-0">{formatDateTime(r.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
