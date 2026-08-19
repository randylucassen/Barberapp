// Gedeelde periode-parsing voor alle /api/admin/reports/*-routes. De
// gebruiker kiest "van" en "tot" als inclusieve datums (bv. hele maand
// augustus = van 2026-08-01 tot 2026-08-31); intern werken de query-
// helpers met een halfopen bereik, dus "tot" wordt hier omgezet naar de
// eerste dag ná de gekozen einddatum.
export interface ReportPeriod {
  from: string;
  to: string;
  toExclusive: string;
}

export function parseReportPeriod(searchParams: URLSearchParams): ReportPeriod | null {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return null;
  }
  const toDate = new Date(`${to}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  return { from, to, toExclusive: toDate.toISOString().slice(0, 10) };
}
