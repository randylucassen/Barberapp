import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card } from "@/components/ui";
import { createServiceClient } from "@/lib/supabase/service";
import { getAdminStats } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

function Tile({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <Card variant="outline" padding={20}>
      <div className="text-[13px] text-text-secondary">{label}</div>
      <div className="text-[28px] font-bold tracking-[-0.02em] mt-1">{value}</div>
    </Card>
  );
  // Niet-klikbare tegels (de meeste hierboven) blijven een kale Card —
  // alleen degene met een href krijgt een <Link>-wrapper, zodat de
  // cursor/hover alleen daar echt "klikbaar" oogt.
  return href ? <Link href={href}>{content}</Link> : content;
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
        <Tile
          label="Account verwijderingen"
          value={String(stats.accountDeletions)}
          href="/admin/account-verwijderingen"
        />
      </div>
    </AdminShell>
  );
}
