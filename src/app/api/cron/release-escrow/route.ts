import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { releasePaymentEscrow } from "@/lib/escrow";

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

    const result = await releasePaymentEscrow(supabase, payment, booking.barber_id);
    results.push({ bookingId: booking.id, outcome: result.ok ? "vrijgegeven" : result.reason });
  }

  return NextResponse.json({ processed: results.length, results });
}
