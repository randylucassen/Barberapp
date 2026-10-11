"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { FilterField } from "@/components/admin/FilterField";
import { euro } from "@/lib/pricing";
import type { AdminTransactionRow } from "@/lib/supabase/queries";

function formatDate(iso: string): string {
  if (!iso) return "Onbekende datum";
  return new Date(iso).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

interface Filters {
  from: string;
  to: string;
}
const EMPTY_FILTERS: Filters = { from: "", to: "" };

// Zelfde draft/applied-filterpatroon als InvoicesTable (pas filteren na
// "Zoeken"/Enter, niet instant) — zelfde reden: kan flink oplopen zodra
// er veel afgeronde boekingen zijn.
export function TransactionsTable({ transactions }: { transactions: AdminTransactionRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const hasAnyFilters = draft.from !== "" || draft.to !== "" || applied.from !== "" || applied.to !== "";

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
    return transactions.filter((t) => {
      const day = t.completedAt.slice(0, 10);
      if (applied.from && day < applied.from) return false;
      if (applied.to && day > applied.to) return false;
      return true;
    });
  }, [transactions, applied]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
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

      {filtered.length === 0 ? (
        <div className="text-[14px] text-text-secondary">
          {transactions.length === 0 ? "Nog geen voltooide transacties." : "Geen transacties gevonden voor dit filter."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[14px] leading-[20px]">
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/gebruikers/${t.customerId}`)}
                    className="font-semibold text-text-primary underline decoration-border hover:decoration-text-primary"
                  >
                    {t.customerName}
                  </button>{" "}
                  voltooide transactie met{" "}
                  {t.barberId ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/gebruikers/${t.barberId}`)}
                      className="font-semibold text-text-primary underline decoration-border hover:decoration-text-primary"
                    >
                      {t.barberName}
                    </button>
                  ) : (
                    <span className="font-semibold">{t.barberName}</span>
                  )}{" "}
                  op {formatDate(t.completedAt)}
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">{t.serviceName}</div>
              </div>
              <div className="flex-shrink-0 text-[15px] font-bold">
                {t.amountCents !== null ? `€${euro(t.amountCents)}` : "–"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
