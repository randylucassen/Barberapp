import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

export type EscrowReleaseResult = { ok: true; transferId: string } | { ok: false; reason: string };

// Eén atomische vrijgave-actie, gedeeld door drie aanroepers die elk hun
// eigen voorwaarden hebben vóór ze hier komen (leeftijd + booking-status
// voor de 24u-cron, een open-geschil-check voor de handmatige knop bij
// Betalingen, niets extra voor een geschil dat zojuist in het voordeel
// van de barber is afgehandeld) — die voorwaarden horen dus bij de
// aanroeper, niet hier. Dit is puur het Stripe-connect-check +
// atomische escrow_state-claim + transfer-stuk, 1-op-1 overgenomen uit
// wat voorheen alleen in de cron-route stond.
export async function releasePaymentEscrow(
  service: SupabaseClient,
  payment: { id: string; barber_payout_cents: number },
  barberId: string | null
): Promise<EscrowReleaseResult> {
  if (!barberId) {
    return { ok: false, reason: "Geen barber gekoppeld aan deze boeking" };
  }

  const { data: barberProfile } = await service
    .from("barber_profiles")
    .select("stripe_account_id, stripe_payouts_enabled")
    .eq("id", barberId)
    .maybeSingle();

  if (!barberProfile?.stripe_account_id || !barberProfile.stripe_payouts_enabled) {
    return { ok: false, reason: "Barber is nog niet (volledig) gekoppeld aan Stripe" };
  }

  // Atomisch claimen vóór de Stripe-call — zelfde patroon als
  // claimBooking(): de where-clause wordt door Postgres opnieuw
  // geëvalueerd bij gelijktijdige updates, dus als de cron en deze actie
  // (of twee handmatige klikken) dezelfde rij tegelijk oppakken, "wint"
  // er maar één en krijgt de ander hier data: null terug.
  const { data: claimed } = await service
    .from("payments")
    .update({ escrow_state: "releasing" })
    .eq("id", payment.id)
    .eq("escrow_state", "held")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { ok: false, reason: "Betaling staat niet (meer) op 'held' — mogelijk al vrijgegeven of terugbetaald" };
  }

  try {
    const transfer = await getStripe().transfers.create({
      amount: payment.barber_payout_cents,
      currency: "eur",
      destination: barberProfile.stripe_account_id,
    });
    await service
      .from("payments")
      .update({ escrow_state: "released", released_at: new Date().toISOString(), stripe_transfer_id: transfer.id })
      .eq("id", payment.id);
    return { ok: true, transferId: transfer.id };
  } catch (err) {
    // Rij teruggezet naar 'held' i.p.v. vast te laten staan op
    // 'releasing' — zelfde reden als in de oorspronkelijke cron: een
    // mislukte transfer mag de rij niet voorgoed onbereikbaar maken.
    await service.from("payments").update({ escrow_state: "held" }).eq("id", payment.id);
    return { ok: false, reason: `Stripe-transfer mislukt: ${(err as Error).message}` };
  }
}
