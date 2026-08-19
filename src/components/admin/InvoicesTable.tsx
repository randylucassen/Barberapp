"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { FilterField } from "@/components/admin/FilterField";
import { euro } from "@/lib/pricing";
import type { AdminInvoiceRow } from "@/lib/supabase/queries";

function invoiceLabel(periodEnd: string, invoiceNumber: number): string {
  const year = new Date(periodEnd).getFullYear();
  return `INV-${year}-${String(invoiceNumber).padStart(4, "0")}`;
}

function monthKey(periodStart: string): string {
  return periodStart.slice(0, 7);
}

function formatMonthLabel(periodStart: string): string {
  const label = new Date(periodStart).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface Filters {
  name: string;
  number: string;
  from: string;
  to: string;
}
const EMPTY_FILTERS: Filters = { name: "", number: "", from: "", to: "" };

// Filters worden pas toegepast na een expliciete klik op "Zoeken" (of
// Enter) — bewust anders dan het instant-filteren dat hier eerder stond,
// op uitdrukkelijk verzoek nu het aantal facturen door de bulk-testdata
// flink is gegroeid (100+, verspreid over meerdere maanden). Twee losse
// state-lagen: `draft` (wat je typt) en `applied` (wat daadwerkelijk
// filtert) — "Herstel filters" reset allebei meteen, "Zoeken" kopieert
// draft naar applied.
export function InvoicesTable({ invoices }: { invoices: AdminInvoiceRow[] }) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const hasAnyFilters =
    draft.name !== "" || draft.number !== "" || draft.from !== "" || draft.to !== "" || applied.name !== "" || applied.number !== "" || applied.from !== "" || applied.to !== "";

  function handleSearch() {
    setApplied(draft);
  }

  function handleReset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  }

  function handleFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (applied.name && !inv.barberName.toLowerCase().includes(applied.name.toLowerCase())) return false;
      if (applied.number) {
        const label = invoiceLabel(inv.periodEnd, inv.invoiceNumber);
        const matchesLabel = label.toLowerCase().includes(applied.number.toLowerCase());
        const matchesRaw = String(inv.invoiceNumber).includes(applied.number.replace(/\D/g, ""));
        if (!matchesLabel && !matchesRaw) return false;
      }
      if (applied.from && inv.periodStart < applied.from) return false;
      if (applied.to && inv.periodStart > applied.to) return false;
      return true;
    });
  }, [invoices, applied]);

  // Groeperen op maand — nieuwste maand eerst, binnen een maand op
  // barbernaam gesorteerd zodat dezelfde barber niet door de hele lijst
  // verspreid staat.
  const groups = useMemo(() => {
    const byMonth = new Map<string, AdminInvoiceRow[]>();
    for (const inv of filtered) {
      const key = monthKey(inv.periodStart);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(inv);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, invs]) => ({
        key,
        label: formatMonthLabel(invs[0].periodStart),
        invoices: [...invs].sort((a, b) => a.barberName.localeCompare(b.barberName)),
      }));
  }, [filtered]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <FilterField
          label="Naam"
          placeholder="Zoek op barbernaam…"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={handleFieldKeyDown}
          className="w-56"
        />
        <FilterField
          label="Factuurnummer"
          placeholder="Bijv. 2026-0001"
          value={draft.number}
          onChange={(e) => setDraft({ ...draft, number: e.target.value })}
          onKeyDown={handleFieldKeyDown}
          className="w-48"
        />
        <FilterField
          label="Van"
          type="date"
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          onKeyDown={handleFieldKeyDown}
          className="w-44"
        />
        <FilterField
          label="Tot"
          type="date"
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          onKeyDown={handleFieldKeyDown}
          className="w-44"
        />
        <Button size="sm" onClick={handleSearch}>
          Zoeken
        </Button>
        <Button size="sm" variant="secondary" disabled={!hasAnyFilters} onClick={handleReset}>
          Herstel filters
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="text-[14px] text-text-secondary">
          {invoices.length === 0 ? "Nog geen facturen gegenereerd." : "Geen facturen gevonden voor dit filter."}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="text-[15px] font-semibold tracking-[-0.01em] mb-2">
                {group.label} <span className="text-text-tertiary font-normal">({group.invoices.length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {group.invoices.map((invoice) => (
                  <div key={invoice.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold truncate">{invoice.barberName}</div>
                      <div className="text-[13px] text-text-secondary mt-0.5">
                        {invoiceLabel(invoice.periodEnd, invoice.invoiceNumber)} · €{euro(invoice.feeInclBtwCents)} incl. btw
                      </div>
                    </div>
                    <a
                      href={`/api/barber/invoices/${invoice.id}/pdf`}
                      className="flex-shrink-0 h-9 px-4 rounded-md bg-surface text-[13px] font-semibold text-text-primary flex items-center justify-center hover:bg-[#EFEFEF] transition-colors duration-fast ease-groomy"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
