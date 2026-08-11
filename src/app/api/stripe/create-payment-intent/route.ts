import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { computePriceBreakdown } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "create-payment-intent", requests: 10, window: "60 s" });
  if (limited) return limited;

  const { bookingId, discountCode } = (await request.json()) as { bookingId?: string; discountCode?: string };
  if (!bookingId) {
    return NextResponse.json({ error: "bookingId is verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, status, price_cents_snapshot")
    .eq("id", bookingId)
    .single();

  if (!booking || booking.customer_id !== userData.user.id) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }
  if (booking.status !== "requested") {
    return NextResponse.json({ error: "Deze boeking kan niet meer betaald worden" }, { status: 409 });
  }

  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existingPayment) {
    return NextResponse.json({ error: "Deze boeking is al betaald" }, { status: 409 });
  }

  const { totalCents: baseTotalCents } = computePriceBreakdown(booking.price_cents_snapshot);
  let totalCents = baseTotalCents;

  if (discountCode) {
    const { data: discountCents, error: discountError } = await supabase.rpc("redeem_discount_code", {
      p_code: discountCode,
      p_booking_id: bookingId,
      p_total_cents: baseTotalCents,
    });
    if (discountError) {
      return NextResponse.json({ error: discountError.message }, { status: 400 });
    }
    totalCents = baseTotalCents - (discountCents as number);
  }

  // idempotencyKey: twee (bijna-)gelijktijdige aanroepen voor dezelfde
  // boeking (dubbele klik, herhaalde fetch) krijgen zo dezelfde
  // PaymentIntent terug van Stripe i.p.v. dat er stiekem een tweede,
  // los van de app onzichtbaar betaalbaar object ontstaat — de
  // `existingPayment`-check hierboven vangt dit niet, want die query
  // gebeurt vóór de webhook ooit een payments-rij aanmaakt.
  const paymentIntent = await getStripe().paymentIntents.create(
    {
      amount: totalCents,
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId, customerId: userData.user.id },
    },
    { idempotencyKey: `payment-intent-${bookingId}` }
  );

  return NextResponse.json({ clientSecret: paymentIntent.client_secret, totalCents });
}
