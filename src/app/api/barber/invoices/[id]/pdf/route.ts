import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/supabase/admin";
import { getInvoiceForBarber } from "@/lib/supabase/queries";
import { renderInvoicePdfBuffer } from "@/lib/invoice-pdf";
import type { BarberInvoice } from "@/lib/types";

// Toegankelijk voor de eigen barber (via get_own_barber_invoices, ziet
// nooit andermans factuur) én voor admin (via de service role, voor
// /admin/facturen). PDF wordt on-demand gegenereerd uit de bevroren
// line_items/totalen op de rij, nooit uit live payments-data.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let invoice: BarberInvoice | null = await getInvoiceForBarber(supabase, id);
  let barberId = userData.user.id;

  if (!invoice) {
    // Niet de eigen factuur — alleen admin mag dan nog verder.
    const admin = await requireAdmin(supabase);
    if (!admin) {
      return NextResponse.json({ error: "Factuur niet gevonden" }, { status: 404 });
    }
    const service = createServiceClient();
    const { data } = await service.from("barber_invoices").select("*").eq("id", id).maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Factuur niet gevonden" }, { status: 404 });
    }
    invoice = {
      id: data.id,
      invoiceNumber: data.invoice_number,
      barberId: data.barber_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      feeExclBtwCents: data.fee_excl_btw_cents,
      btwCents: data.btw_cents,
      feeInclBtwCents: data.fee_incl_btw_cents,
      lineItems: data.line_items,
      createdAt: data.created_at,
    };
    barberId = data.barber_id;
  }

  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("full_name").eq("id", barberId).single();
  const { data: barberProfile } = await service
    .from("barber_profiles")
    .select("address, city, kvk_number")
    .eq("id", barberId)
    .single();

  const pdfBuffer = await renderInvoicePdfBuffer(invoice, {
    name: profile?.full_name ?? "Onbekend",
    address: barberProfile?.address ?? null,
    city: barberProfile?.city ?? null,
    kvkNumber: barberProfile?.kvk_number ?? null,
  });

  const year = new Date(invoice.periodEnd).getFullYear();
  const filename = `factuur-INV-${year}-${String(invoice.invoiceNumber).padStart(4, "0")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
