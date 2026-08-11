import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

const RELEASE_AFTER_MS = 24 * 60 * 60 * 1000;

// Geen Supabase-sessie (machine-to-machine, aangeroepen door pg_cron/
// pg_net of handmatig voor testen) — beveiligd met een gedeeld secret
// i.p.v. RLS. Verwerkt rijen sequentieel (niet parallel) zodat een
// gedeeltelijke mislukking binnen één run nooit tot een dubbele transfer
// kan leiden.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - RELEASE_AFTER_MS).toISOString();

  const { data: heldPayments } = await supabase
    .from("payments")
    .select("id, booking_id, barber_payout_cents")
    .eq("escrow_state", "held");

  const results: { bookingId: string; outcome: string }[] = [];

  for (const payment of heldPayments ?? []) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, completed_at, barber_id")
      .eq("id", payment.booking_id)
      .single();

    if (!booking || booking.status !== "completed" || !booking.completed_at) {
      continue;
    }
    if (booking.completed_at > cutoff) {
      results.push({ bookingId: booking.id, outcome: "nog binnen 24u" });
      continue;
    }

    const { data: openDispute } = await supabase
      .from("disputes")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("status", "open")
      .maybeSingle();
    if (openDispute) {
      results.push({ bookingId: booking.id, outcome: "geblokkeerd door open geschil" });
      continue;
    }

    const { data: barberProfile } = await supabase
      .from("barber_profiles")
      .select("stripe_account_id, stripe_payouts_enabled")
      .eq("id", booking.barber_id)
      .single();

    if (!barberProfile?.stripe_account_id || !barberProfile.stripe_payouts_enabled) {
      results.push({ bookingId: booking.id, outcome: "barber nog niet Stripe-gekoppeld, overgeslagen" });
      continue;
    }

    // Atomisch claimen vóór de Stripe-call — zelfde patroon als
    // claimBooking(): de where-clause wordt door Postgres opnieuw
    // geëvalueerd bij gelijktijdige updates, dus als twee cron-runs
    // (bv. een overlappende pg_cron-trigger + een handmatige test-run)
    // deze rij tegelijk oppakken, "wint" er maar één en krijgt de ander
    // hier data: null terug — geen dubbele transfer meer mogelijk.
    const { data: claimed } = await supabase
      .from("payments")
      .update({ escrow_state: "releasing" })
      .eq("id", payment.id)
      .eq("escrow_state", "held")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      results.push({ bookingId: booking.id, outcome: "al geclaimd door een andere run, overgeslagen" });
      continue;
    }

    // Eén mislukte transfer (bv. Stripe weigert de connected account nog
    // even) mag de rest van deze batch niet blokkeren — vang de fout op
    // per boeking i.p.v. de hele run te laten crashen, zodat andere
    // boekingen in dezelfde run alsnog vrijgegeven worden. De rij gaat
    // terug naar 'held' zodat de volgende cron-run het gewoon opnieuw
    // probeert i.p.v. voorgoed vast te blijven staan op 'releasing'.
    try {
      const transfer = await getStripe().transfers.create({
        amount: payment.barber_payout_cents,
        currency: "eur",
        destination: barberProfile.stripe_account_id,
      });

      await supabase
        .from("payments")
        .update({ escrow_state: "released", released_at: new Date().toISOString(), stripe_transfer_id: transfer.id })
        .eq("id", payment.id);

      results.push({ bookingId: booking.id, outcome: "vrijgegeven" });
    } catch (err) {
      await supabase.from("payments").update({ escrow_state: "held" }).eq("id", payment.id);
      results.push({ bookingId: booking.id, outcome: `transfer mislukt: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
