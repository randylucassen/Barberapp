import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { computePriceBreakdown } from "@/lib/pricing";

// Bron van waarheid voor betalingen: nooit een payments-rij schrijven op
// basis van een client-side "succes"-signaal (vooral bij iDEAL's
// redirect-flow onbetrouwbaar) — alleen deze webhook, geverifieerd met
// STRIPE_WEBHOOK_SECRET, mag dat.
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Geen Stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: `Ongeldige webhook-signature: ${(err as Error).message}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (paymentIntent.metadata.type === "wallet_topup") {
      const { data: topup } = await supabase
        .from("wallet_topups")
        .select("id, status")
        .eq("stripe_payment_intent_id", paymentIntent.id)
        .maybeSingle();
      if (topup && topup.status === "pending") {
        await supabase.rpc("process_wallet_topup", { p_topup_id: topup.id });
      }
      return NextResponse.json({ received: true });
    }

    const bookingId = paymentIntent.metadata.bookingId;
    if (!bookingId) {
      return NextResponse.json({ received: true });
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, price_cents_snapshot")
      .eq("id", bookingId)
      .single();
    if (!booking) {
      return NextResponse.json({ received: true });
    }

    const { totalCents, feeCents, barberPayoutCents } = computePriceBreakdown(booking.price_cents_snapshot);

    // Fase 9: als er een kortingscode is toegepast (redeem_discount_code,
    // aangeroepen vanuit create-payment-intent) staat het bedrag dat
    // Stripe daadwerkelijk incasseerde lager dan totalCents — dat
    // verschil moet in payments.discount_cents/amount_cents terugkomen,
    // anders klopt de boekhouding niet meer met wat Stripe rapporteert.
    const { data: redemption } = await supabase
      .from("discount_code_redemptions")
      .select("discount_cents")
      .eq("booking_id", bookingId)
      .maybeSingle();
    const discountCents = redemption?.discount_cents ?? 0;

    const { error: insertError } = await supabase.from("payments").insert({
      booking_id: bookingId,
      amount_cents: totalCents - discountCents,
      platform_fee_cents: feeCents,
      barber_payout_cents: barberPayoutCents,
      discount_cents: discountCents,
      escrow_state: "held",
      stripe_payment_intent_id: paymentIntent.id,
    });
    // 23505 = unique-constraint-violatie op bookings.booking_id — dat is
    // een verwachte, onschadelijke webhook-redelivery (Stripe levert soms
    // hetzelfde event twee keer af), geen echte fout. Alles anders (bv.
    // een tweede, écht andere PaymentIntent voor dezelfde boeking die
    // Stripe wél als afzonderlijke betaling ziet) betekent geld dat is
    // afgeschreven zonder herleidbare rij — dat mag nooit stil verdwijnen.
    if (insertError && insertError.code !== "23505") {
      Sentry.captureException(new Error(`payments-insert mislukt voor booking ${bookingId}: ${insertError.message}`));
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    await supabase
      .from("barber_profiles")
      .update({ stripe_payouts_enabled: account.payouts_enabled ?? false })
      .eq("stripe_account_id", account.id);
  }

  // payment_intent.payment_failed: bewust geen actie — de boeking blijft
  // 'requested' zonder payments-rij, dus onzichtbaar voor barbers (zie
  // 0009_stripe_escrow.sql). De klant kan het gewoon opnieuw proberen.

  return NextResponse.json({ received: true });
}
