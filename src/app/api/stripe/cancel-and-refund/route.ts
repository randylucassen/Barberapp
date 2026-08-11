import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const { bookingId, cancelledReason } = (await request.json()) as {
    bookingId?: string;
    cancelledReason?: string;
  };
  if (!bookingId || !cancelledReason) {
    return NextResponse.json({ error: "bookingId en cancelledReason zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, barber_id")
    .eq("id", bookingId)
    .single();
  if (!booking) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }

  const cancelledBy =
    booking.customer_id === userData.user.id
      ? "customer"
      : booking.barber_id === userData.user.id
        ? "barber"
        : null;
  if (!cancelledBy) {
    return NextResponse.json({ error: "Geen toegang tot deze boeking" }, { status: 403 });
  }

  // Zelfde update als de bestaande directe client-call — loopt via de
  // gebruikers-sessie (niet de service role), dus check_booking_status_
  // transition() valideert de overgang precies zoals altijd. Geen
  // bypass van die logica, alleen de refund-stap eronder is nieuw.
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: cancelledBy, cancelled_reason: cancelledReason })
    .eq("id", bookingId);

  if (updateError) {
    return NextResponse.json({ error: "Annuleren is niet gelukt — mogelijk is de status al gewijzigd." }, { status: 409 });
  }

  const service = createServiceClient();
  const { data: payment } = await service
    .from("payments")
    .select("id, stripe_payment_intent_id, escrow_state")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (payment && payment.escrow_state === "held" && payment.stripe_payment_intent_id) {
    await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
    await service
      .from("payments")
      .update({ escrow_state: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", payment.id);
  }

  return NextResponse.json({ success: true });
}
