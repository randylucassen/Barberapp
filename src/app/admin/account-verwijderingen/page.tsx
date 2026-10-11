import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { getAccountDeletionsForAdmin } from "@/lib/supabase/queries";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminAccountDeletionsPage() {
  const supabase = createServiceClient();
  const rows = await getAccountDeletionsForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Account verwijderingen</div>
      <div className="text-[13px] text-text-secondary mb-4">
        Opgegeven redenen bij &ldquo;Account verwijderen&rdquo; (klant- en barber-kant). Het bijbehorende profiel
        is op dat moment al geanonimiseerd — hieronder staat bewust alleen rol, datum en reden, geen naam/e-mail.
      </div>
      {rows.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Nog geen account-verwijderingen.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white border border-border rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <Badge variant={r.role === "barber" ? "accent" : "neutral"}>
                  {r.role === "barber" ? "Barber" : "Klant"}
                </Badge>
                <span className="text-[13px] text-text-secondary">{formatDateTime(r.createdAt)}</span>
              </div>
              <div className="text-[14px] mt-2 whitespace-pre-wrap">{r.reason}</div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
