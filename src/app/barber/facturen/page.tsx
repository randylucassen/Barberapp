"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/ui";
import { Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getInvoicesForBarber } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import type { BarberInvoice } from "@/lib/types";

function formatPeriod(invoice: BarberInvoice): string {
  const start = new Date(invoice.periodStart);
  const end = new Date(invoice.periodEnd);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) return start.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  return `${start.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
}

function invoiceLabel(invoice: BarberInvoice): string {
  const year = new Date(invoice.periodEnd).getFullYear();
  return `INV-${year}-${String(invoice.invoiceNumber).padStart(4, "0")}`;
}

export default function BarberInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<BarberInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const rows = await getInvoicesForBarber(supabase);
      setInvoices(rows);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Facturen" onBack={() => router.push("/barber/profiel")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="text-[13px] text-text-secondary leading-[19px]">
          Maandelijkse btw-factuur voor de servicekosten die al met je uitbetalingen zijn verrekend — je
          hoeft hier zelf niets voor te betalen.
        </div>
        <div className="mt-3">
          {!loading && invoices.length === 0 && (
            <div className="text-[14px] text-text-secondary py-4">
              Nog geen facturen. De eerste verschijnt hier na afloop van je eerste volledige maand.
            </div>
          )}
          {invoices.map((invoice) => (
            <Row
              key={invoice.id}
              title={formatPeriod(invoice)}
              sub={`${invoiceLabel(invoice)} · €${euro(invoice.feeInclBtwCents)} incl. btw`}
              right={
                <a
                  href={`/api/barber/invoices/${invoice.id}/pdf`}
                  className="text-[13px] font-semibold text-text-accent"
                >
                  Download
                </a>
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
