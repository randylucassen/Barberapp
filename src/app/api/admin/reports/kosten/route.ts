import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { parseReportPeriod } from "@/lib/report-period";
import { getCostReportRows } from "@/lib/supabase/queries";
import { buildKostenCsv } from "@/lib/admin-reports";

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
  const rows = await getCostReportRows(service, period.from, period.toExclusive);

  if (request.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json(rows);
  }

  const csv = buildKostenCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="groomy-kosten-${period.from}_${period.to}.csv"`,
    },
  });
}
