import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";

const GRACE_MS = 60 * 60 * 1000;

// Zelfde patroon als expire-stale-requests/route.ts: geen Supabase-sessie
// (machine-to-machine, aangeroepen door pg_cron/pg_net of handmatig voor
// testen), beveiligd met CRON_SECRET i.p.v. RLS. Zie migratie 0035 voor
// de bijbehorende notificatie-trigger-uitbreiding en de
// barber_no_show_warnings-tabel.
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
    .eq("requested_asap", false)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", cutoff);

  const results: { bookingId: string; outcome: string }[] = [];

  for (const booking of overdue ?? []) {
    // Atomisch claimen (zelfde reden als bij expire-stale-requests):
    // voorkomt dat een overlappende cron-run dezelfde rij twee keer
    // annuleert en daarmee ook twee keer refund/waarschuwing zou geven.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_reason: "Automatisch geannuleerd: barber heeft niet binnen 60 minuten na de afgesproken tijd bevestigd onderweg te zijn",
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
        body: "Je account is geschorst omdat je voor de 2e keer een geplande afspraak niet op tijd bevestigd hebt. Neem contact op met support als je dit wilt bespreken.",
        related_booking_id: booking.id,
      });
      results.push({ bookingId: booking.id, outcome: `verlopen + refund + geschorst (waarschuwing ${warningCount})` });
    } else {
      await supabase.from("notifications").insert({
        user_id: booking.barber_id,
        type: "cancelled",
        title: "Waarschuwing: afspraak niet op tijd bevestigd",
        body: "Je hebt een geplande afspraak niet binnen 60 minuten na de afgesproken tijd bevestigd. De boeking is geannuleerd en de klant is terugbetaald. Bij nog een keer wordt je account geschorst.",
        related_booking_id: booking.id,
      });
      results.push({ bookingId: booking.id, outcome: `verlopen + refund + waarschuwing ${warningCount}` });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
