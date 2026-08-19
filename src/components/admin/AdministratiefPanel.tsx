"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { euro } from "@/lib/pricing";
import type { AdminRevenueReportRow, AdminCostReportRow } from "@/lib/supabase/queries";

type ReportKey = "omzet" | "kosten" | "samenvatting" | "facturen";

interface ReportTypeDef {
  key: ReportKey;
  title: string;
  description: string;
  downloadLabel: string;
}

const REPORT_TYPES: ReportTypeDef[] = [
  {
    key: "omzet",
    title: "Omzet-overzicht",
    description: "Elke boeking met klantbedrag, barber-uitkering en het verschil dat als omzet bij het platform blijft.",
    downloadLabel: "CSV",
  },
  {
    key: "kosten",
    title: "Kosten-overzicht",
    description: "Wallet-stortingsbonussen en referral-bonussen die het platform die maand heeft weggegeven.",
    downloadLabel: "CSV",
  },
  {
    key: "samenvatting",
    title: "Samenvatting",
    description: "Bruto omzet, kosten, brutoresultaat, en de btw per stroom (klant-servicekosten / barberfacturen).",
    downloadLabel: "CSV",
  },
  {
    key: "facturen",
    title: "Commissiefacturen",
    description: "Alle btw-facturen aan barbers die maand, gebundeld als PDF's. “Bekijken” opent de factuurlijst.",
    downloadLabel: "ZIP",
  },
];

function monthRange(monthKey: string): { from: string; to: string } {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const monthIndex0 = Number(monthStr) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` };
}

function formatMonthLabel(monthKey: string): string {
  const label = new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("nl-NL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

type PreviewStatus = "loading" | "error" | "ready";

const ESCROW_LABEL: Record<string, string> = {
  held: "Vastgehouden",
  releasing: "Wordt vrijgegeven",
  released: "Vrijgegeven",
  paid: "Uitbetaald",
  refunded: "Terugbetaald",
};

function OmzetPreview({ rows }: { rows: AdminRevenueReportRow[] }) {
  if (rows.length === 0) return <div className="text-[13px] text-text-secondary py-2">Geen boekingen deze maand.</div>;
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-text-tertiary border-b border-border">
            <th className="py-1.5 pr-3 font-medium">Datum</th>
            <th className="py-1.5 pr-3 font-medium">Dienst</th>
            <th className="py-1.5 pr-3 font-medium">Barber</th>
            <th className="py-1.5 pr-3 font-medium">Klant betaalde</th>
            <th className="py-1.5 pr-3 font-medium">Omzet</th>
            <th className="py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bookingId} className="border-b border-border/60">
              <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("nl-NL")}</td>
              <td className="py-1.5 pr-3">{r.serviceName}</td>
              <td className="py-1.5 pr-3">{r.barberName}</td>
              <td className="py-1.5 pr-3">€{euro(r.amountCents)}</td>
              <td className="py-1.5 pr-3">€{euro(r.revenueCents)}</td>
              <td className="py-1.5">{ESCROW_LABEL[r.escrowState] ?? r.escrowState}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KostenPreview({ rows }: { rows: AdminCostReportRow[] }) {
  if (rows.length === 0) return <div className="text-[13px] text-text-secondary py-2">Geen kosten deze maand.</div>;
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-[13px]">
        <thead className="sticky top-0 bg-white">
          <tr className="text-left text-text-tertiary border-b border-border">
            <th className="py-1.5 pr-3 font-medium">Datum</th>
            <th className="py-1.5 pr-3 font-medium">Gebruiker</th>
            <th className="py-1.5 pr-3 font-medium">Type</th>
            <th className="py-1.5 font-medium">Bedrag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60">
              <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString("nl-NL")}</td>
              <td className="py-1.5 pr-3">{r.userName}</td>
              <td className="py-1.5 pr-3">{r.entryType}</td>
              <td className="py-1.5">€{euro(r.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SamenvattingPreview({ rows }: { rows: string[][] }) {
  return (
    <div className="text-[13px]">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/60">
          <span className="text-text-secondary">{label}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function AdministratiefPanel({ availableMonths }: { availableMonths: string[] }) {
  const [expandedType, setExpandedType] = useState<ReportKey | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [previewStatus, setPreviewStatus] = useState<Record<string, PreviewStatus>>({});

  function toggleType(key: ReportKey) {
    setExpandedType(expandedType === key ? null : key);
    setExpandedMonth(null);
  }

  async function toggleMonth(type: ReportKey, monthKey: string) {
    const cacheKey = `${type}:${monthKey}`;
    if (expandedMonth === cacheKey) {
      setExpandedMonth(null);
      return;
    }
    setExpandedMonth(cacheKey);
    if (previewStatus[cacheKey] === "ready" || previewStatus[cacheKey] === "loading" || type === "facturen") return;

    setPreviewStatus((s) => ({ ...s, [cacheKey]: "loading" }));
    const { from, to } = monthRange(monthKey);
    try {
      const res = await fetch(`/api/admin/reports/${type}?from=${from}&to=${to}&format=json`);
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      setPreviewData((p) => ({ ...p, [cacheKey]: data }));
      setPreviewStatus((s) => ({ ...s, [cacheKey]: "ready" }));
    } catch {
      setPreviewStatus((s) => ({ ...s, [cacheKey]: "error" }));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {REPORT_TYPES.map((type) => {
        const isTypeOpen = expandedType === type.key;
        return (
          <div key={type.key} className="bg-white border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleType(type.key)}
              className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-surface transition-colors duration-fast ease-groomy"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isTypeOpen ? (
                  <ChevronDown size={16} className="text-text-tertiary flex-shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{type.title}</div>
                  <div className="text-[13px] text-text-secondary mt-0.5">{type.description}</div>
                </div>
              </div>
              <span className="text-[12px] font-semibold text-text-accent flex-shrink-0">{type.downloadLabel}</span>
            </button>

            {isTypeOpen && (
              <div className="border-t border-border px-4 py-2">
                {availableMonths.length === 0 ? (
                  <div className="text-[13px] text-text-secondary py-2">Nog geen data beschikbaar.</div>
                ) : (
                  availableMonths.map((monthKey) => {
                    const { from, to } = monthRange(monthKey);
                    const cacheKey = `${type.key}:${monthKey}`;
                    const isMonthOpen = expandedMonth === cacheKey;
                    const status = previewStatus[cacheKey];
                    return (
                      <div key={monthKey} className="border-b border-border/60 last:border-b-0">
                        <div className="flex items-center justify-between gap-3 py-2.5">
                          <button
                            onClick={() => toggleMonth(type.key, monthKey)}
                            className="flex items-center gap-2 text-[14px] font-medium hover:text-text-accent transition-colors duration-fast ease-groomy"
                          >
                            {isMonthOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {formatMonthLabel(monthKey)}
                          </button>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {type.key === "facturen" ? (
                              <a
                                href={`/admin/facturen?from=${from}&to=${to}`}
                                className="h-8 px-3 rounded-md bg-surface text-[12px] font-semibold text-text-primary flex items-center justify-center hover:bg-[#EFEFEF] transition-colors duration-fast ease-groomy"
                              >
                                Bekijken
                              </a>
                            ) : null}
                            <a
                              href={`/api/admin/reports/${type.key}?from=${from}&to=${to}`}
                              className="h-8 px-3 rounded-md bg-surface text-[12px] font-semibold text-text-primary flex items-center justify-center hover:bg-[#EFEFEF] transition-colors duration-fast ease-groomy"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                        {isMonthOpen && type.key !== "facturen" && (
                          <div className="pb-3">
                            {status === "loading" && <div className="text-[13px] text-text-secondary py-2">Laden…</div>}
                            {status === "error" && (
                              <div className="text-[13px] text-error py-2">Kon deze maand niet laden.</div>
                            )}
                            {status === "ready" && type.key === "omzet" && (
                              <OmzetPreview rows={previewData[cacheKey] as AdminRevenueReportRow[]} />
                            )}
                            {status === "ready" && type.key === "kosten" && (
                              <KostenPreview rows={previewData[cacheKey] as AdminCostReportRow[]} />
                            )}
                            {status === "ready" && type.key === "samenvatting" && (
                              <SamenvattingPreview rows={previewData[cacheKey] as string[][]} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      <a
        href={`/api/admin/reports/alles?from=${availableMonths[availableMonths.length - 1] ? monthRange(availableMonths[availableMonths.length - 1]).from : ""}&to=${
          availableMonths[0] ? monthRange(availableMonths[0]).to : ""
        }`}
        className="w-full h-ctrl-lg rounded-md bg-accent text-white flex items-center justify-center font-semibold text-[16px] hover:bg-accent-dark transition-colors duration-fast ease-groomy"
      >
        Download alles (alle beschikbare maanden, ZIP)
      </a>
    </div>
  );
}
