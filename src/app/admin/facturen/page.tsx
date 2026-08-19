import { AdminShell } from "@/components/admin/AdminShell";
import { createServiceClient } from "@/lib/supabase/service";
import { getAllInvoicesForAdmin } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

function invoiceLabel(periodEnd: string, invoiceNumber: number): string {
  const year = new Date(periodEnd).getFullYear();
  return `INV-${year}-${String(invoiceNumber).padStart(4, "0")}`;
}

export default async function AdminInvoicesPage() {
  const supabase = createServiceClient();
  const invoices = await getAllInvoicesForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Facturen</div>
      <div className="text-[14px] text-text-secondary mb-4">
        Maandelijkse btw-facturen voor de servicekosten die bij barbers zijn ingehouden. Een barber zonder
        ingevuld adres wordt automatisch overgeslagen (krijgt zelf een melding om dit aan te vullen).
      </div>
      {invoices.length === 0 ? (
        <div className="text-[14px] text-text-secondary">Nog geen facturen gegenereerd.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-[15px] font-semibold">{invoice.barberName}</div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {invoiceLabel(invoice.periodEnd, invoice.invoiceNumber)} · {formatPeriod(invoice.periodStart)} ·
                  {" "}€{euro(invoice.feeInclBtwCents)} incl. btw
                </div>
              </div>
              <a
                href={`/api/barber/invoices/${invoice.id}/pdf`}
                className="text-[13px] font-semibold text-text-accent flex-shrink-0"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
