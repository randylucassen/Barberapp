import { AdminShell } from "@/components/admin/AdminShell";
import { InvoicesTable } from "@/components/admin/InvoicesTable";
import { createServiceClient } from "@/lib/supabase/service";
import { getAllInvoicesForAdmin } from "@/lib/supabase/queries";

export default async function AdminInvoicesPage() {
  const supabase = createServiceClient();
  const invoices = await getAllInvoicesForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Facturen</div>
      <div className="text-[14px] text-text-secondary mb-4">
        Maandelijkse btw-facturen voor de servicekosten die bij barbers zijn ingehouden, gegroepeerd per maand. Een
        barber zonder ingevuld adres wordt automatisch overgeslagen (krijgt zelf een melding om dit aan te vullen).
      </div>
      <InvoicesTable invoices={invoices} />
    </AdminShell>
  );
}
