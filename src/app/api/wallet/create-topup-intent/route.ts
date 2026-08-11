import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { WALLET_MIN_TOPUP_CENTS, WALLET_MAX_TOPUP_CENTS, computeTopupBonus } from "@/lib/wallet";
import { checkRateLimit } from "@/lib/rate-limit";

// Losstaand van /api/stripe/create-payment-intent (geen boeking
// betrokken) — zie "Fase 9 — architectuur" in PROJECT.md voor de
// redenering om dit geen parameter op die route te maken.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "wallet-topup", requests: 10, window: "60 s" });
  if (limited) return limited;

  const { amountCents } = (await request.json()) as { amountCents?: number };
  if (!Number.isInteger(amountCents) || amountCents! < WALLET_MIN_TOPUP_CENTS || amountCents! > WALLET_MAX_TOPUP_CENTS) {
    return NextResponse.json({ error: "Ongeldig bedrag" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const bonusCents = computeTopupBonus(amountCents!);

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: amountCents!,
    currency: "eur",
    automatic_payment_methods: { enabled: true },
    metadata: { type: "wallet_topup", userId: userData.user.id },
  });

  const { data: topup, error } = await supabase
    .from("wallet_topups")
    .insert({
      user_id: userData.user.id,
      amount_cents: amountCents,
      bonus_cents: bonusCents,
      status: "pending",
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();
  if (error || !topup) {
    return NextResponse.json({ error: "Kon opwaardering niet aanmaken" }, { status: 500 });
  }

  return NextResponse.json({ clientSecret: paymentIntent.client_secret, bonusCents, topupId: topup.id });
}
