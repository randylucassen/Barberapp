import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { releasePaymentEscrow } from "@/lib/escrow";

// Handmatige "vrijgeven"-knop bij Betalingen — voor als een admin niet op
// de 24u-cron wil wachten. Anders dan de cron: geen leeftijd-/
// booking-status-eis (de admin beslist hier zelf, direct), maar wél
// dezelfde open-geschil-blokkade — geld vrijgeven terwijl er nog een
// lopend geschil op deze boeking staat zou precies de bescherming
// omzeilen waar escrow/geschillen voor bestaan. Is er een geschil,
// gebruik dan /api/admin/disputes/resolve, die zet dit bij "Vrijgeven
// aan barber" automatisch door.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { paymentId } = (await request.json()) as { paymentId?: string };
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: payment } = await service
    .from("payments")
    .select("id, booking_id, barber_payout_cents, escrow_state")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) {
    return NextResponse.json({ error: "Betaling niet gevonden" }, { status: 404 });
  }
  if (payment.escrow_state !== "held") {
    return NextResponse.json(
      { error: `Deze betaling staat op '${payment.escrow_state}', niet op 'held' — niets om vrij te geven` },
      { status: 409 }
    );
  }

  const { data: booking } = await service
    .from("bookings")
    .select("barber_id")
    .eq("id", payment.booking_id)
    .single();

  const { data: openDispute } = await service
    .from("disputes")
    .select("id")
    .eq("booking_id", payment.booking_id)
    .eq("status", "open")
    .maybeSingle();
  if (openDispute) {
    return NextResponse.json(
      { error: "Er staat nog een open geschil op deze boeking — los dat eerst op via Geschillen" },
      { status: 409 }
    );
  }

  const result = await releasePaymentEscrow(service, payment, booking?.barber_id ?? null);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: "escrow_released_manually",
    targetType: "payment",
    targetId: paymentId,
  });

  return NextResponse.json({ success: true });
}
