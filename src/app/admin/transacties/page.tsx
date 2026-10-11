import { AdminShell } from "@/components/admin/AdminShell";
import { TransactionsTable } from "@/components/admin/TransactionsTable";
import { createServiceClient } from "@/lib/supabase/service";
import { getCompletedTransactionsForAdmin } from "@/lib/supabase/queries";

export default async function AdminTransactionsPage() {
  const supabase = createServiceClient();
  const transactions = await getCompletedTransactionsForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Transacties</div>
      <div className="text-[14px] text-text-secondary mb-4">
        Elke voltooide boeking, klant en barber bij elkaar — filterbaar op datum. Voor bedragen/btw/escrow-status
        per betaling, zie Betalingen; voor de maandelijkse commissiefacturen, zie Facturen.
      </div>
      <TransactionsTable transactions={transactions} />
    </AdminShell>
  );
}
