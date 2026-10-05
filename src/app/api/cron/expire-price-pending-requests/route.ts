import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Zelfde patroon als expire-stale-requests/expire-unpaid-scheduled-
// bookings: geen Supabase-sessie (machine-to-machine via pg_cron/pg_net,
// of handmatig voor testen), beveiligd met CRON_SECRET i.p.v. RLS.
//
// Anders dan de andere expiry-crons: dit is een REOPEN, geen cancel.
// Zie migratie 0042 — een open_request-aanvraag die 30 minuten geleden
// door een barber is geclaimd zonder dat de klant de prijs heeft
// bevestigd, valt terug naar 'requested' (barber_id/prijs/booking_
// services ongedaan gemaakt) i.p.v. definitief te annuleren — zelfde
// reset als decline_price_and_reopen(), maar hier server-side vanuit de
// cron i.p.v. een klant-initiated RPC-call. De oorspronkelijke 1-uurs-
// klok (expire-stale-requests, open_request-tak) blijft de enige echte
// "definitief dood"-grens. Geen refund-stap nodig — er is nooit iets
// afgeschreven vóór een prijs bekend is.
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
    .eq("status", "price_pending")
    .not("price_confirm_due_at", "is", null)
    .lte("price_confirm_due_at", nowIso);

  const results: { bookingId: string; outcome: string }[] = [];

  for (const booking of overdue ?? []) {
    // Atomisch claimen (zelfde reden als de andere expiry-crons):
    // voorkomt dat een overlappende cron-run dezelfde rij twee keer
    // reopent en dus ook twee keer een melding stuurt.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({
        barber_id: null,
        status: "requested",
        price_cents_snapshot: null,
        duration_minutes_snapshot: null,
        price_confirm_due_at: null,
      })
      .eq("id", booking.id)
      .eq("status", "price_pending")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      results.push({ bookingId: booking.id, outcome: "al geclaimd door een andere run, overgeslagen" });
      continue;
    }

    await supabase.from("booking_services").delete().eq("booking_id", booking.id);

    if (booking.barber_id) {
      await supabase.from("notifications").insert({
        user_id: booking.barber_id,
        type: "cancelled",
        title: "Prijsbevestiging verlopen",
        body: "De klant heeft niet binnen 30 minuten gereageerd op je prijsvoorstel — de aanvraag staat weer open voor andere barbers.",
        related_booking_id: booking.id,
      });
    }

    results.push({ bookingId: booking.id, outcome: "prijsbevestiging verlopen, aanvraag weer open" });
  }

  return NextResponse.json({ processed: results.length, results });
}
