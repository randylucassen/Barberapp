import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const STUCK_STATUSES = ["arrived", "in_progress"] as const;

// Escape-hatch (pre-launch audit) voor boekingen die op arrived/in_progress
// vastlopen — check_booking_status_transition() staat daar geen enkele
// cancel meer toe (bewust, voor de normale klant-/barberflow) en een
// geschil vereist status='completed'. Deze route gebruikt de service role,
// die de trigger's rolvalidatie sowieso al overslaat (auth.uid() is null,
// zie 0009_stripe_escrow.sql) — completed_at wordt daarom hier zelf gezet,
// want dat zet de trigger normaal alleen in het (voor service-role
// overgeslagen) validatiepad.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { bookingId, action } = (await request.json()) as { bookingId?: string; action?: "complete" | "cancel" };
  if (!bookingId || (action !== "complete" && action !== "cancel")) {
    return NextResponse.json({ error: "bookingId en een geldige action zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: booking } = await service
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .single();

  if (!booking) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }
  if (!STUCK_STATUSES.includes(booking.status as (typeof STUCK_STATUSES)[number])) {
    return NextResponse.json(
      { error: "Alleen boekingen op 'arrived' of 'in_progress' kunnen zo geforceerd worden" },
      { status: 409 }
    );
  }

  if (action === "complete") {
    await service
      .from("bookings")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", bookingId);
  } else {
    const { data: payment } = await service
      .from("payments")
      .select("id, stripe_payment_intent_id, escrow_state")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (payment && payment.escrow_state === "held" && payment.stripe_payment_intent_id) {
      try {
        await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
      } catch (err) {
        return NextResponse.json(
          { error: `Terugbetalen bij Stripe is mislukt, boeking is niet geannuleerd: ${(err as Error).message}` },
          { status: 502 }
        );
      }
      await service
        .from("payments")
        .update({ escrow_state: "refunded", refunded_at: new Date().toISOString() })
        .eq("id", payment.id);
    }

    await service
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_reason: "Geannuleerd door beheerder — boeking was vastgelopen zonder eigen herstelpad",
      })
      .eq("id", bookingId);
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: action === "complete" ? "booking_force_completed" : "booking_force_cancelled",
    targetType: "booking",
    targetId: bookingId,
  });

  return NextResponse.json({ success: true });
}
