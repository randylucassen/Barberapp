import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { parseReportPeriod } from "@/lib/report-period";
import { buildInvoicePdfEntries, zipToBuffer } from "@/lib/admin-reports";

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
  const entries = await buildInvoicePdfEntries(service, period.from, period.toExclusive);
  const zipBuffer = await zipToBuffer(entries);

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="groomy-facturen-${period.from}_${period.to}.zip"`,
    },
  });
}
