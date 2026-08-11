import { AdminShell } from "@/components/admin/AdminShell";
import { createServiceClient } from "@/lib/supabase/service";
import { getAdminActionLog } from "@/lib/supabase/queries";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.round(hours / 24);
  return `${days} d geleden`;
}

export default async function AdminLogPage() {
  const supabase = createServiceClient();
  const entries = await getAdminActionLog(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Logboek</div>
      {entries.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Nog geen admin-acties.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((e) => (
            <div key={e.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold">{e.action}</div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {e.adminName}
                  {e.targetType && ` · ${e.targetType}${e.targetId ? ` (${e.targetId.slice(0, 8)})` : ""}`}
                  {e.detail && ` · ${e.detail}`}
                </div>
              </div>
              <div className="text-[13px] text-text-tertiary flex-shrink-0">{timeAgo(e.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
