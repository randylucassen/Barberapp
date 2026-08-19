"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui";
import { euro } from "@/lib/pricing";
import type { AdminInvoiceRow } from "@/lib/supabase/queries";

function invoiceLabel(periodEnd: string, invoiceNumber: number): string {
  const year = new Date(periodEnd).getFullYear();
  return `INV-${year}-${String(invoiceNumber).padStart(4, "0")}`;
}

function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

// Client-side filteren i.p.v. het bestaande server-side searchParams-
// patroon (StatusFilter/UserSearch) — bewust, voor drie tegelijk actieve
// filters die direct (geen page-navigatie) moeten reageren, zoals
// gevraagd ("zo makkelijk en snel mogelijk terugvinden"). Facturen
// blijven naar verwachting een bescheiden aantal, dus geen paginering
// nodig.
export function InvoicesTable({ invoices }: { invoices: AdminInvoiceRow[] }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (name && !inv.barberName.toLowerCase().includes(name.toLowerCase())) return false;
      if (number) {
        const label = invoiceLabel(inv.periodEnd, inv.invoiceNumber);
        const matchesLabel = label.toLowerCase().includes(number.toLowerCase());
        const matchesRaw = String(inv.invoiceNumber).includes(number.replace(/\D/g, ""));
        if (!matchesLabel && !matchesRaw) return false;
      }
      if (from && inv.periodStart < from) return false;
      if (to && inv.periodStart > to) return false;
      return true;
    });
  }, [invoices, name, number, from, to]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          label="Naam"
          placeholder="Zoek op barbernaam…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-56"
        />
        <Input
          label="Factuurnummer"
          placeholder="Bijv. 2026-0001"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-48"
        />
        <Input label="Van" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <Input label="Tot" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-[14px] text-text-secondary">
          {invoices.length === 0 ? "Nog geen facturen gegenereerd." : "Geen facturen gevonden voor dit filter."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((invoice) => (
            <a
              key={invoice.id}
              href={`/api/barber/invoices/${invoice.id}/pdf`}
              className="block bg-white border border-border rounded-lg p-4 flex items-center justify-between hover:border-accent transition-colors duration-fast ease-groomy"
            >
              <div>
                <div className="text-[15px] font-semibold">{invoice.barberName}</div>
                <div className="text-[13px] text-text-secondary mt-0.5">
                  {invoiceLabel(invoice.periodEnd, invoice.invoiceNumber)} · {formatPeriod(invoice.periodStart)} ·{" "}
                  €{euro(invoice.feeInclBtwCents)} incl. btw
                </div>
              </div>
              <span className="text-[13px] font-semibold text-text-accent flex-shrink-0">Download</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
