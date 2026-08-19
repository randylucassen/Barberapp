import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { parseReportPeriod } from "@/lib/report-period";
import { getRevenueReportRows, getCostReportRows, getInvoicesForPeriod } from "@/lib/supabase/queries";
import { buildOmzetCsv, buildKostenCsv, buildSamenvattingCsv, buildInvoicePdfEntries } from "@/lib/admin-reports";

// De "stuur dit naar mijn boekhouder"-knop: alle vier rapportages plus de
// facturen-PDF's in één ZIP, zodat er nooit losse downloads gemist
// kunnen worden voor een periode.
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
  const [revenueRows, costRows, invoices, invoicePdfs] = await Promise.all([
    getRevenueReportRows(service, period.from, period.toExclusive),
    getCostReportRows(service, period.from, period.toExclusive),
    getInvoicesForPeriod(service, period.from, period.toExclusive),
    buildInvoicePdfEntries(service, period.from, period.toExclusive),
  ]);

  const samenvatting = buildSamenvattingCsv({
    from: period.from,
    to: period.to,
    revenueRows,
    costRows,
    invoiceCount: invoices.length,
    invoiceBtwCents: invoices.reduce((sum, i) => sum + i.btwCents, 0),
  });

  const zip = new JSZip();
  zip.file("samenvatting.csv", samenvatting);
  zip.file("omzet.csv", buildOmzetCsv(revenueRows));
  zip.file("kosten.csv", buildKostenCsv(costRows));
  const facturenFolder = zip.folder("facturen");
  for (const entry of invoicePdfs) {
    facturenFolder?.file(entry.filename, entry.buffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="groomy-administratie-${period.from}_${period.to}.zip"`,
    },
  });
}
