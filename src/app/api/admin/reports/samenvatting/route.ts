import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { parseReportPeriod } from "@/lib/report-period";
import { getRevenueReportRows, getCostReportRows, getInvoicesForPeriod } from "@/lib/supabase/queries";
import { buildSamenvattingCsv, buildSamenvattingRows } from "@/lib/admin-reports";

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
  const [revenueRows, costRows, invoices] = await Promise.all([
    getRevenueReportRows(service, period.from, period.toExclusive),
    getCostReportRows(service, period.from, period.toExclusive),
    getInvoicesForPeriod(service, period.from, period.toExclusive),
  ]);

  const summaryInput = {
    from: period.from,
    to: period.to,
    revenueRows,
    costRows,
    invoiceCount: invoices.length,
    invoiceBtwCents: invoices.reduce((sum, i) => sum + i.btwCents, 0),
  };

  if (request.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json(buildSamenvattingRows(summaryInput));
  }

  const csv = buildSamenvattingCsv(summaryInput);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="groomy-samenvatting-${period.from}_${period.to}.csv"`,
    },
  });
}
