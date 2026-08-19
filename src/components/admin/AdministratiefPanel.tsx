"use client";
import { useState } from "react";
import { FilterField } from "@/components/admin/FilterField";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

const TODAY = new Date();

const PRESETS: Array<{ label: string; range: () => [Date, Date] }> = [
  { label: "Deze maand", range: () => [startOfMonth(TODAY), endOfMonth(TODAY)] },
  {
    label: "Vorige maand",
    range: () => {
      const prev = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - 1, 1));
      return [startOfMonth(prev), endOfMonth(prev)];
    },
  },
  {
    label: "Dit jaar",
    range: () => [new Date(Date.UTC(TODAY.getUTCFullYear(), 0, 1)), new Date(Date.UTC(TODAY.getUTCFullYear(), 11, 31))],
  },
];

interface DocType {
  key: string;
  title: string;
  description: string;
  route: string;
  filenameHint: string;
}

const DOCUMENT_TYPES: DocType[] = [
  {
    key: "facturen",
    title: "Commissiefacturen",
    description: "Alle btw-facturen aan barbers in deze periode, gebundeld als PDF's in een ZIP.",
    route: "/api/admin/reports/facturen",
    filenameHint: "ZIP met PDF's",
  },
  {
    key: "omzet",
    title: "Omzet-overzicht",
    description:
      "Elke boeking met klantbedrag, barber-uitkering, de klant-servicekosten apart uitgesplitst in excl./btw/incl., en het verschil dat als omzet bij het platform blijft.",
    route: "/api/admin/reports/omzet",
    filenameHint: "CSV",
  },
  {
    key: "kosten",
    title: "Kosten-overzicht",
    description: "Wallet-stortingsbonussen en referral-bonussen die het platform in deze periode heeft weggegeven.",
    route: "/api/admin/reports/kosten",
    filenameHint: "CSV",
  },
  {
    key: "samenvatting",
    title: "Samenvatting",
    description:
      "Bruto omzet, kosten, brutoresultaat, en de btw apart per stroom: klant-servicekosten en barberfacturen, plus het totaal verschuldigd.",
    route: "/api/admin/reports/samenvatting",
    filenameHint: "CSV",
  },
];

export function AdministratiefPanel() {
  const [from, setFrom] = useState(toDateStr(startOfMonth(TODAY)));
  const [to, setTo] = useState(toDateStr(TODAY));

  function applyPreset(range: () => [Date, Date]) {
    const [start, end] = range();
    setFrom(toDateStr(start));
    setTo(toDateStr(end));
  }

  const query = `from=${from}&to=${to}`;

  return (
    <div>
      <div className="bg-white border border-border rounded-lg p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Van" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          <FilterField label="Tot" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
          <div className="flex gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.range)}
                className="h-9 px-3 rounded-md bg-surface text-[13px] font-medium text-text-primary hover:bg-[#EFEFEF] transition-colors duration-fast ease-groomy"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <a
        href={`/api/admin/reports/alles?${query}`}
        className="w-full h-ctrl-lg rounded-md bg-accent text-white flex items-center justify-center font-semibold text-[16px] mb-5 hover:bg-accent-dark transition-colors duration-fast ease-groomy"
      >
        Download alles voor deze periode (ZIP)
      </a>

      <div className="grid grid-cols-2 gap-3">
        {DOCUMENT_TYPES.map((doc) => (
          <a
            key={doc.key}
            href={`${doc.route}?${query}`}
            className="block bg-white border border-border rounded-lg p-4 hover:border-accent transition-colors duration-fast ease-groomy"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[15px] font-semibold">{doc.title}</span>
              <span className="text-[12px] font-semibold text-text-accent flex-shrink-0">{doc.filenameHint}</span>
            </div>
            <div className="text-[13px] text-text-secondary">{doc.description}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
