import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { recordSucceededPaymentIntent } from "@/lib/payment-reconcile";

// Vangnet voor een gemiste eerste Stripe-webhook-afleverpoging (bv. een
// Vercel cold start) — ontdekt op 2026-08-14 toen twee echte betalingen
// bij Stripe slaagden maar de bijbehorende payments-rij niet ontstond,
// waardoor de boeking onzichtbaar bleef voor de barber
// (booking_has_payment(), zie regel 15 CLAUDE.md). Stripe herprobeert een
// mislukte webhook zelf ook, maar niet snel genoeg voor iemand die meteen
// kijkt — deze cron loopt elke 5 minuten en haalt zelf recente
// succesvolle PaymentIntents op, i.p.v. te wachten op Stripe's eigen
// retry-schema.
const LOOKBACK_MS = 60 * 60 * 1000;

// Zelfde CRON_SECRET-opzet als expire-stale-requests/release-escrow —
// machine-to-machine, geen Supabase-sessie.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const stripe = getStripe();
  const backfilled: { paymentIntentId: string; outcome: string }[] = [];
  let checked = 0;

  let startingAfter: string | undefined;
  const sinceUnix = Math.floor((Date.now() - LOOKBACK_MS) / 1000);
  do {
    const page = await stripe.paymentIntents.list({
      created: { gte: sinceUnix },
      limit: 100,
      starting_after: startingAfter,
    });
    for (const pi of page.data) {
      if (pi.status !== "succeeded") continue;
      checked += 1;
      const result = await recordSucceededPaymentIntent(supabase, pi);
      if (result.created) {
        backfilled.push({ paymentIntentId: pi.id, outcome: result.outcome });
      }
    }
    startingAfter = page.has_more ? page.data[page.data.length - 1].id : undefined;
  } while (startingAfter);

  return NextResponse.json({ checked, backfilled });
}
