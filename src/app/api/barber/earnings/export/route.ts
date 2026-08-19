import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsForBarber } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

// CSV i.p.v. PDF, bewust — dit is geen formeel document (dat is de
// btw-factuur, al gebouwd), maar de eigen ruwe inkomsten-data van de
// barber, bedoeld om in een spreadsheet/boekhoudpakket te plakken. Altijd
// de eigen sessie (auth.uid()), nooit een barberId-parameter — een
// barber kan zo nooit iemand anders' inkomsten opvragen.
const ESCROW_LABEL: Record<string, string> = {
  held: "Vastgehouden",
  releasing: "Wordt vrijgegeven",
  released: "Vrijgegeven",
  paid: "Uitbetaald",
  refunded: "Terugbetaald",
};

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const payments = await getPaymentsForBarber(supabase, userData.user.id);

  const header = ["Datum", "Dienst", "Duur (min)", "Klant betaalde (EUR)", "Jouw ontvangst (EUR)", "Status", "Vrijgegeven op"];
  const rows = payments.map((p) => [
    new Date(p.createdAt).toLocaleDateString("nl-NL"),
    p.serviceName,
    String(p.durationMinutes),
    euro(p.amountCents),
    euro(p.barberPayoutCents),
    ESCROW_LABEL[p.escrowState] ?? p.escrowState,
    p.releasedAt ? new Date(p.releasedAt).toLocaleDateString("nl-NL") : "",
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  // BOM zodat Excel de UTF-8-tekens (bv. "€", "ë") correct herkent.
  const csvWithBom = "﻿" + csv;

  return new NextResponse(csvWithBom, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="groomy-inkomsten-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
