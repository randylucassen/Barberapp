import { AdminShell } from "@/components/admin/AdminShell";
import { DiscountCodesPanel } from "@/components/admin/DiscountCodesPanel";
import { createServiceClient } from "@/lib/supabase/service";
import { getDiscountCodesForAdmin } from "@/lib/supabase/queries";

export default async function AdminDiscountCodesPage() {
  const supabase = createServiceClient();
  const codes = await getDiscountCodesForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Kortingscodes</div>
      <DiscountCodesPanel codes={codes} />
    </AdminShell>
  );
}
