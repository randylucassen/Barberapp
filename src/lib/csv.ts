// Gedeelde CSV-opbouw voor alle export-routes (barber-inkomsten, admin-
// rapportages) — één plek voor de escaping- en BOM-logica i.p.v. hem per
// route te dupliceren.
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(header: string[], rows: string[][]): string {
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  // BOM zodat Excel de UTF-8-tekens (bv. "€", "ë") correct herkent.
  return "﻿" + csv;
}
