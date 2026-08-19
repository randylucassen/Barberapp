"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { euro } from "@/lib/pricing";
import type { AdminInvoiceRow } from "@/lib/supabase/queries";

function invoiceLabel(periodEnd: string, invoiceNumber: number): string {
  const year = new Date(periodEnd).getFullYear();
  return `INV-${year}-${String(invoiceNumber).padStart(4, "0")}`;
}

function formatPeriod(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

// Eigen, lichte filtervakken i.p.v. de gedeelde <Input> uit components/ui
// — die is ontworpen voor phone-shell-formulieren (bg-surface-vulling,
// vaste 48px-hoogte, geen zichtbare rand) en valt op AdminShell's eigen
// bg-surface-paginaondergrond helemaal weg. Hier bewust een zichtbare
// rand + witte vulling, zelfde look als de rest van het adminpanel
// (bg-white border border-border, bv. de kaarten hieronder).
function FilterField({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-text-secondary">{label}</span>
      <input
        {...rest}
        className="h-9 px-3 rounded-md bg-white border border-border text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:shadow-focus-ring transition-shadow duration-fast ease-groomy"
      />
    </label>
  );
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

  const hasFilters = name !== "" || number !== "" || from !== "" || to !== "";

  function resetFilters() {
    setName("");
    setNumber("");
    setFrom("");
    setTo("");
  }

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
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <FilterField
          label="Naam"
          placeholder="Zoek op barbernaam…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-56"
        />
        <FilterField
          label="Factuurnummer"
          placeholder="Bijv. 2026-0001"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="w-48"
        />
        <FilterField label="Van" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <FilterField label="Tot" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        <Button size="sm" variant="secondary" disabled={!hasFilters} onClick={resetFilters}>
          Herstel filters
        </Button>
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
