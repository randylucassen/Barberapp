import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Zelfde patroon als de andere tijd-gebaseerde crons (expire-noshow-
// bookings, reconcile-payments): geen Supabase-sessie, CRON_SECRET i.p.v.
// RLS, handmatig te testen (SQL Editor of rechtstreeks met een expliciete
// period-body). Btw-rondrekening/jsonb-opbouw hoort hier in TypeScript
// i.p.v. in een SQL-functie — zelfde afweging als waarom Stripe-refunds
// ook altijd in een Route Handler zitten.
const BTW_RATE = 0.21;

interface PaymentJoinRow {
  booking_id: string;
  platform_fee_cents: number;
  released_at: string;
  bookings: {
    barber_id: string | null;
    service_name_snapshot: string;
    completed_at: string | null;
  } | null;
}

function previousMonthRange(): { periodStart: string; periodEnd: string; periodEndExclusive: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endInclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: endInclusive.toISOString().slice(0, 10),
    periodEndExclusive: endExclusive.toISOString().slice(0, 10),
  };
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Handmatig testen met een expliciete periode toestaat een andere
  // maand dan "vorige kalendermaand" — de echte cron stuurt altijd een
  // lege body mee.
  const body = await request.json().catch(() => ({}));
  const { periodStart, periodEnd, periodEndExclusive } =
    body.periodStart && body.periodEnd
      ? {
          periodStart: body.periodStart as string,
          periodEnd: body.periodEnd as string,
          periodEndExclusive: (body.periodEndExclusive as string) ?? body.periodEnd,
        }
      : previousMonthRange();

  const supabase = createServiceClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("booking_id, platform_fee_cents, released_at, bookings(barber_id, service_name_snapshot, completed_at)")
    .gte("released_at", periodStart)
    .lt("released_at", periodEndExclusive)
    .neq("escrow_state", "refunded");

  const byBarber = new Map<string, PaymentJoinRow[]>();
  for (const row of (payments ?? []) as unknown as PaymentJoinRow[]) {
    const barberId = row.bookings?.barber_id;
    if (!barberId) continue;
    if (!byBarber.has(barberId)) byBarber.set(barberId, []);
    byBarber.get(barberId)!.push(row);
  }

  const results: { barberId: string; outcome: string }[] = [];

  for (const [barberId, rows] of byBarber) {
    const { data: barberProfile } = await supabase
      .from("barber_profiles")
      .select("address")
      .eq("id", barberId)
      .single();

    if (!barberProfile?.address) {
      await supabase.from("notifications").insert({
        user_id: barberId,
        type: "invoice_address_missing",
        title: "Vul je adres in voor je maandfactuur",
        body: "We konden je btw-factuur over de afgelopen maand niet aanmaken omdat je adres nog ontbreekt. Vul 'm aan bij je gegevens.",
      });
      results.push({ barberId, outcome: "overgeslagen: geen adres" });
      continue;
    }

    const feeInclBtwCents = rows.reduce((sum, r) => sum + r.platform_fee_cents, 0);
    const feeExclBtwCents = Math.round(feeInclBtwCents / (1 + BTW_RATE));
    const btwCents = feeInclBtwCents - feeExclBtwCents;

    const lineItems = rows.map((r) => ({
      bookingId: r.booking_id,
      date: r.bookings?.completed_at ?? periodStart,
      serviceName: r.bookings?.service_name_snapshot ?? "Onbekende dienst",
      feeInclBtwCents: r.platform_fee_cents,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("barber_invoices")
      .insert({
        barber_id: barberId,
        period_start: periodStart,
        period_end: periodEnd,
        fee_excl_btw_cents: feeExclBtwCents,
        btw_cents: btwCents,
        fee_incl_btw_cents: feeInclBtwCents,
        line_items: lineItems,
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        results.push({ barberId, outcome: "overgeslagen: factuur voor deze periode bestond al" });
      } else {
        results.push({ barberId, outcome: `mislukt: ${insertError.message}` });
      }
      continue;
    }

    await supabase.from("notifications").insert({
      user_id: barberId,
      type: "invoice_available",
      title: "Nieuwe factuur beschikbaar",
      body: "Je btw-factuur over de afgelopen maand staat klaar om te downloaden.",
      related_booking_id: null,
    });

    results.push({ barberId, outcome: `factuur aangemaakt (${inserted.id})` });
  }

  return NextResponse.json({ periodStart, periodEnd, processed: results.length, results });
}
