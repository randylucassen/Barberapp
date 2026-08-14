import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { computePriceBreakdown } from "@/lib/pricing";

export interface RecordResult {
  // true zodra dit een payments-rij of wallet-topup daadwerkelijk voor
  // het eerst verwerkte — false voor "was al gebeurd"/"niets te doen".
  created: boolean;
  outcome: string;
}

// Enige bron van waarheid om een succesvolle Stripe-PaymentIntent om te
// zetten naar een payments-rij (of een verwerkte wallet-topup) — gebruikt
// door zowel de webhook (het normale, snelle pad) als de
// reconcile-payments-cron (het vangnet voor een gemiste eerste
// webhook-aflevering, zie CLAUDE.md-incident 2026-08-14). Beide moeten
// exact dezelfde logica gebruiken, anders lopen ze op termijn uiteen.
export async function recordSucceededPaymentIntent(
  supabase: SupabaseClient,
  paymentIntent: Stripe.PaymentIntent
): Promise<RecordResult> {
  if (paymentIntent.metadata.type === "wallet_topup") {
    const { data: topup } = await supabase
      .from("wallet_topups")
      .select("id, status")
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .maybeSingle();
    if (!topup) return { created: false, outcome: "geen wallet_topups-rij gevonden" };
    if (topup.status !== "pending") return { created: false, outcome: "topup al verwerkt" };
    await supabase.rpc("process_wallet_topup", { p_topup_id: topup.id });
    return { created: true, outcome: "wallet-topup alsnog verwerkt" };
  }

  const bookingId = paymentIntent.metadata.bookingId;
  if (!bookingId) return { created: false, outcome: "geen bookingId in metadata, overgeslagen" };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, price_cents_snapshot")
    .eq("id", bookingId)
    .single();
  if (!booking) return { created: false, outcome: "boeking niet gevonden" };

  const { totalCents, feeCents, barberPayoutCents } = computePriceBreakdown(booking.price_cents_snapshot);

  // Fase 9: als er een kortingscode is toegepast staat het bedrag dat
  // Stripe daadwerkelijk incasseerde lager dan totalCents — dat verschil
  // moet in payments.discount_cents/amount_cents terugkomen.
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

  // 23505 = unique-constraint-violatie op bookings.booking_id — een
  // verwachte, onschadelijke dubbele verwerking (webhook-redelivery of
  // deze cron die dezelfde intent nogmaals tegenkomt), geen echte fout.
  if (insertError && insertError.code === "23505") {
    return { created: false, outcome: "payments-rij bestond al" };
  }
  if (insertError) {
    Sentry.captureException(new Error(`payments-insert mislukt voor booking ${bookingId}: ${insertError.message}`));
    return { created: false, outcome: `insert mislukt: ${insertError.message}` };
  }
  return { created: true, outcome: "payments-rij alsnog aangemaakt" };
}
