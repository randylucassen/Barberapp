import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Zelfde patroon als expire-stale-requests/expire-noshow-bookings: geen
// Supabase-sessie (machine-to-machine via pg_cron/pg_net, of handmatig
// voor testen), beveiligd met CRON_SECRET i.p.v. RLS. Zie migratie 0040
// voor de payment_due_at-kolom en de bijbehorende notificatie-trigger-
// uitbreiding. Geen refund-stap nodig — er is voor zo'n boeking nooit
// iets afgeschreven.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: overdue } = await supabase
    .from("bookings")
    .select("id, barber_id")
    .eq("status", "accepted")
    .not("payment_due_at", "is", null)
    .lte("payment_due_at", nowIso);

  const results: { bookingId: string; outcome: string }[] = [];

  for (const booking of overdue ?? []) {
    // Best-effort race-guard tegen een klant die exact rond dit moment
    // alsnog betaalt: check nogmaals vlak vóór het annuleren (de
    // atomische claim hieronder dekt gelijktijdige cron-runs, dit dekt
    // een gelijktijdige succesvolle betaling).
    const { data: payment } = await supabase.from("payments").select("id").eq("booking_id", booking.id).maybeSingle();
    if (payment) {
      results.push({ bookingId: booking.id, outcome: "inmiddels betaald, overgeslagen" });
      continue;
    }

    // Atomisch claimen (zelfde reden als de andere expiry-crons):
    // voorkomt dat een overlappende cron-run dezelfde rij twee keer
    // annuleert en dus ook twee keer een melding stuurt.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_reason: "Automatisch vervallen: niet binnen 24 uur na acceptatie betaald",
      })
      .eq("id", booking.id)
      .eq("status", "accepted")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      results.push({ bookingId: booking.id, outcome: "al geclaimd door een andere run, overgeslagen" });
      continue;
    }

    if (booking.barber_id) {
      await supabase.from("notifications").insert({
        user_id: booking.barber_id,
        type: "cancelled",
        title: "Afspraak vervallen — niet op tijd betaald",
        body: "De klant heeft niet binnen 24 uur na jouw acceptatie betaald. De geplande afspraak is automatisch vervallen.",
        related_booking_id: booking.id,
      });
    }

    results.push({ bookingId: booking.id, outcome: "vervallen wegens niet-tijdige betaling" });
  }

  return NextResponse.json({ processed: results.length, results });
}
