import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

const UNMATCHED_TIMEOUT_MS = 30 * 60 * 1000;
// Open-aanvragen (automatisch toewijzen zonder match, zie 0042) krijgen
// een langer venster — 1 uur in plaats van 30 minuten, met de gebruiker
// afgestemd — vóórdat ze definitief vervallen. Een tussentijdse claim +
// geweigerde/verlopen prijsbevestiging (zie
// expire-price-pending-requests) zet zo'n aanvraag terug naar
// 'requested' zonder created_at te resetten, dus deze 1-uurs-klok is de
// enige, absolute "echt dood"-grens voor het hele traject.
const OPEN_REQUEST_TIMEOUT_MS = 60 * 60 * 1000;

// Zelfde patroon als release-escrow/route.ts: geen Supabase-sessie
// (machine-to-machine, aangeroepen door pg_cron/pg_net of handmatig voor
// testen), beveiligd met CRON_SECRET i.p.v. RLS.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const results: { bookingId: string; outcome: string }[] = [];

  const unmatchedCutoff = new Date(Date.now() - UNMATCHED_TIMEOUT_MS).toISOString();
  const { data: staleBookings } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "requested")
    .eq("open_request", false)
    .lte("created_at", unmatchedCutoff);

  for (const stale of staleBookings ?? []) {
    // Atomisch claimen (zelfde reden als bij release-escrow): voorkomt
    // dat een overlappende cron-run dezelfde rij twee keer annuleert en
    // daarmee mogelijk ook twee keer probeert te refunden.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_reason: "Automatisch geannuleerd: geen reactie binnen 30 minuten",
      })
      .eq("id", stale.id)
      .eq("status", "requested")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      results.push({ bookingId: stale.id, outcome: "al geclaimd door een andere run, overgeslagen" });
      continue;
    }

    // Zelfde refund-logica als cancel-and-refund/route.ts: een klant kan
    // in theorie al betaald hebben vlak vóórdat de timeout afliep.
    const { data: payment } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, escrow_state")
      .eq("booking_id", stale.id)
      .maybeSingle();

    if (payment && payment.escrow_state === "held" && payment.stripe_payment_intent_id) {
      try {
        await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
        await supabase
          .from("payments")
          .update({ escrow_state: "refunded", refunded_at: new Date().toISOString() })
          .eq("id", payment.id);
        results.push({ bookingId: stale.id, outcome: "verlopen + refund" });
      } catch (err) {
        results.push({ bookingId: stale.id, outcome: `verlopen, refund mislukt: ${(err as Error).message}` });
      }
    } else {
      results.push({ bookingId: stale.id, outcome: "verlopen" });
    }
  }

  // Open-aanvragen (0042) hebben nooit een betaling — er is per definitie
  // nog geen prijs bekend vóór een barber claimt — dus geen refund-stap
  // nodig, simpelweg annuleren.
  const openRequestCutoff = new Date(Date.now() - OPEN_REQUEST_TIMEOUT_MS).toISOString();
  const { data: staleOpenRequests } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "requested")
    .eq("open_request", true)
    .lte("created_at", openRequestCutoff);

  for (const stale of staleOpenRequests ?? []) {
    const { data: claimed } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_reason: "Automatisch geannuleerd: niemand heeft binnen 1 uur gereageerd op je aanvraag",
      })
      .eq("id", stale.id)
      .eq("status", "requested")
      .select("id")
      .maybeSingle();

    results.push(
      claimed
        ? { bookingId: stale.id, outcome: "open-aanvraag verlopen" }
        : { bookingId: stale.id, outcome: "al geclaimd door een andere run, overgeslagen" }
    );
  }

  return NextResponse.json({ processed: results.length, results });
}
