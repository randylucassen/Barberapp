import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { parseReportPeriod } from "@/lib/report-period";
import { getRevenueReportRows } from "@/lib/supabase/queries";
import { buildOmzetCsv } from "@/lib/admin-reports";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const period = parseReportPeriod(request.nextUrl.searchParams);
  if (!period) {
    return NextResponse.json({ error: "Ongeldige periode" }, { status: 400 });
  }

  const service = createServiceClient();
  const rows = await getRevenueReportRows(service, period.from, period.toExclusive);

  // JSON i.p.v. CSV voor de inline "Bekijken"-voorvertoning per maand in
  // /admin/administratief — zelfde onderliggende data, geen download.
  if (request.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json(rows);
  }

  const csv = buildOmzetCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="groomy-omzet-${period.from}_${period.to}.csv"`,
    },
  });
}
