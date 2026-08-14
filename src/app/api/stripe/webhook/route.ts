import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { recordSucceededPaymentIntent } from "@/lib/payment-reconcile";

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
    await recordSucceededPaymentIntent(supabase, paymentIntent);
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
