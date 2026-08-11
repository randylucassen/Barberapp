import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { getAdminStats } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="outline" padding={20}>
      <div className="text-[13px] text-text-secondary">{label}</div>
      <div className="text-[28px] font-bold tracking-[-0.02em] mt-1">{value}</div>
    </Card>
  );
}

export default async function AdminDashboardPage() {
  const supabase = createServiceClient();
  const stats = await getAdminStats(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-5">Statistieken</div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Tile label="Totaal boekingen" value={String(stats.totalBookings)} />
        <Tile label="Platformomzet" value={`€${euro(stats.totalRevenueCents)}`} />
        <Tile label="Actieve barbers" value={String(stats.activeBarbers)} />
        <Tile label="Openstaande goedkeuringen" value={String(stats.pendingApprovals)} />
        <Tile label="Openstaande geschillen" value={String(stats.openDisputes)} />
      </div>
    </AdminShell>
  );
}
