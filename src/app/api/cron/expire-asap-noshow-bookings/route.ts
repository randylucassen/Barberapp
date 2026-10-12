import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

// ASAP-tegenhanger van expire-noshow-bookings (migratie 0035) — dat
// pad geldt expliciet alleen voor geplande boekingen (requested_asap=
// false, getimed op scheduled_at). Een ASAP-boeking heeft geen
// scheduled_at om tegen af te zetten, dus hier updated_at als peildatum
// (door de generieke set_updated_at()-trigger, 0001/0003, al bij elke
// statusovergang bijgewerkt — zolang er niets anders aan de rij
// verandert tussen accepted en en_route is dat betrouwbaar "het moment
// van accepteren"). 20 minuten i.p.v. 60: "snelste beschikbare barber"
// impliceert een veel kortere redelijke wachttijd dan een geplande
// afspraak.
//
// Resterende logica (refund, waarschuwing, 2e-keer-schorsing) is 1-op-1
// hetzelfde als expire-noshow-bookings, inclusief het delen van
// dezelfde barber_no_show_warnings-telling — een barber die niet komt
// opdagen is hetzelfde probleem, ongeacht of het een geplande of ASAP-
// afspraak was. check_booking_status_transition() staat deze
// cancelled_by=null-overgang al toe (dezelfde tak als bij een geplande
// no-show, geen database-wijziging nodig), en
// notify_customer_on_status_change() stuurt via de bestaande
// "cancelled_by is null and old.status='accepted'"-tak (zonder
// payment_due_at, wat een ASAP-boeking nooit heeft, zie 0057) al
// automatisch de juiste "volledig terugbetaald"-melding.
const GRACE_MS = 20 * 60 * 1000;

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();

  const { data: overdue } = await supabase
    .from("bookings")
    .select("id, barber_id")
    .eq("status", "accepted")
    .eq("requested_asap", true)
    .lte("updated_at", cutoff);

  const results: { bookingId: string; outcome: string }[] = [];

  for (const booking of overdue ?? []) {
    // Atomisch claimen (zelfde reden als expire-noshow-bookings):
    // voorkomt dat een overlappende cron-run dezelfde rij twee keer
    // annuleert en daarmee ook twee keer refund/waarschuwing zou geven.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_reason: "Automatisch geannuleerd: barber heeft niet binnen 20 minuten na acceptatie bevestigd onderweg te zijn",
      })
      .eq("id", booking.id)
      .eq("status", "accepted")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      results.push({ bookingId: booking.id, outcome: "al geclaimd door een andere run, overgeslagen" });
      continue;
    }

    // Volledige refund incl. servicekosten — bewust geen annulerings-
    // kosten-logica (die geldt alleen als de klánt te laat annuleert,
    // zie booking-timing.ts): dit is de schuld van de barber.
    const { data: payment } = await supabase
      .from("payments")
      .select("id, stripe_payment_intent_id, escrow_state")
      .eq("booking_id", booking.id)
      .maybeSingle();

    if (payment && payment.escrow_state === "held" && payment.stripe_payment_intent_id) {
      try {
        await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
        await supabase
          .from("payments")
          .update({ escrow_state: "refunded", refunded_at: new Date().toISOString() })
          .eq("id", payment.id);
      } catch (err) {
        results.push({ bookingId: booking.id, outcome: `verlopen, refund mislukt: ${(err as Error).message}` });
        continue;
      }
    }

    if (!booking.barber_id) {
      results.push({ bookingId: booking.id, outcome: "verlopen + refund" });
      continue;
    }

    await supabase.from("barber_no_show_warnings").insert({ barber_id: booking.barber_id, booking_id: booking.id });
    const { count } = await supabase
      .from("barber_no_show_warnings")
      .select("id", { count: "exact", head: true })
      .eq("barber_id", booking.barber_id);
    const warningCount = count ?? 1;

    if (warningCount >= 2) {
      await supabase.from("profiles").update({ barber_status: "suspended" }).eq("id", booking.barber_id);
      await supabase.from("notifications").insert({
        user_id: booking.barber_id,
        type: "cancelled",
        title: "Account geschorst",
        body: "Je account is geschorst omdat je voor de 2e keer een afspraak niet op tijd bevestigd hebt. Neem contact op met support als je dit wilt bespreken.",
        related_booking_id: booking.id,
      });
      results.push({ bookingId: booking.id, outcome: `verlopen + refund + geschorst (waarschuwing ${warningCount})` });
    } else {
      await supabase.from("notifications").insert({
        user_id: booking.barber_id,
        type: "cancelled",
        title: "Waarschuwing: afspraak niet op tijd bevestigd",
        body: "Je hebt een geaccepteerde aanvraag niet binnen 20 minuten bevestigd onderweg te zijn. De boeking is geannuleerd en de klant is terugbetaald. Bij nog een keer wordt je account geschorst.",
        related_booking_id: booking.id,
      });
      results.push({ bookingId: booking.id, outcome: `verlopen + refund + waarschuwing ${warningCount}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
