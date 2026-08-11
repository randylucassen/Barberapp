import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Twee resolutiepaden, allebei bewust géén hergebruik van bestaande
// booking-brede routes:
// - "refund": alleen de betaling terugdraaien (payments.escrow_state ->
//   refunded) — bookings.status blijft 'completed', want de dienst is
//   wél geleverd, alleen de betaling wordt teruggedraaid. Anders dan
//   /api/stripe/cancel-and-refund, die ook de boeking zelf annuleert
//   (bedoeld voor vóór de dienst, niet van toepassing bij een geschil
//   over een al afgeronde boeking). Sinds 0027 (meerdere diensten per
//   boeking) kan de admin per dienst-regel (booking_services) een
//   `refundLines: [{lineId, quantity}]` meegeven om maar een deel van
//   een regel terug te betalen — in dat geval krijgt de barber meteen
//   (niet pas via de escrow-cron, die deze rij toch overslaat zodra hij
//   niet meer 'held' is) proportioneel uitbetaald voor de resterende
//   waarde, zie de "isPartial"-tak hieronder. Zijn alle regels volledig
//   gekozen (of ontbreekt refundLines), dan is het een volledige
//   terugbetaling en krijgt de barber niets voor deze boeking.
// - "dismiss": alleen disputes.status -> dismissed. De bestaande
//   release-escrow-cron (elke 15 min) slaat een boeking met een open
//   geschil bewust over — zodra het geschil niet meer open is, pakt de
//   eerstvolgende cron-run de vrijgave vanzelf op. Geen aparte
//   "nu vrijgeven"-actie nodig.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { disputeId, resolution, refundLines } = (await request.json()) as {
    disputeId?: string;
    resolution?: "refund" | "dismiss";
    refundLines?: { lineId: string; quantity: number }[];
  };
  if (!disputeId || (resolution !== "refund" && resolution !== "dismiss")) {
    return NextResponse.json({ error: "disputeId en een geldige resolution zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: dispute } = await service
    .from("disputes")
    .select("id, booking_id, status")
    .eq("id", disputeId)
    .single();
  if (!dispute) {
    return NextResponse.json({ error: "Geschil niet gevonden" }, { status: 404 });
  }
  if (dispute.status !== "open") {
    return NextResponse.json({ error: "Dit geschil is al afgehandeld" }, { status: 409 });
  }

  const { data: booking } = await service
    .from("bookings")
    .select("customer_id, barber_id, service_name_snapshot")
    .eq("id", dispute.booking_id)
    .single();

  let resolutionNotes = "Vrijgegeven aan barber";
  let isPartialRefund = false;

  if (resolution === "refund") {
    const { data: payment } = await service
      .from("payments")
      .select("id, stripe_payment_intent_id, escrow_state, amount_cents, barber_payout_cents")
      .eq("booking_id", dispute.booking_id)
      .maybeSingle();

    // Geen stille "opgelost"-registratie meer als er niets terugbetaald
    // is (bv. de 15-minuten-escrow-cron gaf de betaling al vrij vóórdat
    // de admin hier op klikte) — dat gaf eerder een vals audit-spoor:
    // het geschil stond op "resolved: Terugbetaald aan klant" terwijl er
    // geen euro was teruggegaan.
    if (!payment || payment.escrow_state !== "held" || !payment.stripe_payment_intent_id) {
      return NextResponse.json(
        {
          error:
            "Kan niet terugbetalen: er is geen vastgehouden betaling meer voor dit geschil (mogelijk al vrijgegeven aan de barber). Gebruik desnoods 'Vrijgeven aan barber' om het geschil te sluiten.",
        },
        { status: 409 }
      );
    }

    const { data: lineRows } = await service
      .from("booking_services")
      .select("id, service_name_snapshot, quantity, unit_price_cents_snapshot")
      .eq("booking_id", dispute.booking_id);
    const lines = lineRows ?? [];
    if (lines.length === 0) {
      return NextResponse.json({ error: "Geen dienst-regels gevonden voor deze boeking" }, { status: 409 });
    }

    const requestedByLineId = new Map((refundLines ?? []).map((l) => [l.lineId, l.quantity]));
    let totalValueCents = 0;
    let refundValueCents = 0;
    const refundSummaryParts: string[] = [];
    for (const line of lines) {
      const fullValue = line.unit_price_cents_snapshot * line.quantity;
      totalValueCents += fullValue;
      const requestedQty = requestedByLineId.get(line.id) ?? line.quantity;
      const qty = Math.min(Math.max(Math.round(requestedQty), 0), line.quantity);
      refundValueCents += line.unit_price_cents_snapshot * qty;
      if (qty > 0) refundSummaryParts.push(`${qty} van ${line.quantity}x ${line.service_name_snapshot}`);
    }

    if (refundValueCents <= 0) {
      return NextResponse.json({ error: "Selecteer minstens één te terugbetalen dienst/aantal" }, { status: 400 });
    }

    const isPartial = refundValueCents < totalValueCents;
    const remainingValueCents = totalValueCents - refundValueCents;

    // Bij een gedeeltelijke terugbetaling moet de barber meteen zijn
    // proportionele deel krijgen (met de gebruiker afgestemd — anders zou
    // een klacht over een deel van de boeking de barber ook zijn deel voor
    // de rest kosten). Dat vereist een Stripe-koppeling; zonder die
    // koppeling kan hier niet zomaar op teruggekomen worden (escrow_state
    // is een enkel veld, geen "deels vrij/deels terugbetaald"-status) —
    // liever vooraf blokkeren met een duidelijke melding dan een boeking
    // in een staat achterlaten die de escrow-cron niet meer oppakt.
    let barberStripeAccountId: string | null = null;
    if (isPartial) {
      const { data: barberProfile } = await service
        .from("barber_profiles")
        .select("stripe_account_id, stripe_payouts_enabled")
        .eq("id", booking?.barber_id)
        .maybeSingle();
      if (!barberProfile?.stripe_account_id || !barberProfile.stripe_payouts_enabled) {
        return NextResponse.json(
          {
            error:
              "Kan niet gedeeltelijk terugbetalen: de barber is nog niet gekoppeld aan Stripe, dus het overige bedrag kan niet worden uitgekeerd. Gebruik een volledige terugbetaling, of wacht tot de barber wel gekoppeld is.",
          },
          { status: 409 }
        );
      }
      barberStripeAccountId = barberProfile.stripe_account_id;
    }

    // refundValueCents/totalValueCents is de dienstwaarde (excl.
    // servicekosten) — het daadwerkelijk betaalde bedrag (payment.amount_cents,
    // incl. servicekosten en evt. korting) schaalt evenredig mee.
    const refundAmountCents = isPartial ? Math.round((payment.amount_cents * refundValueCents) / totalValueCents) : undefined;

    try {
      await getStripe().refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        ...(refundAmountCents !== undefined ? { amount: refundAmountCents } : {}),
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Terugbetalen bij Stripe is mislukt, geschil is niet gewijzigd: ${(err as Error).message}` },
        { status: 502 }
      );
    }

    if (isPartial && barberStripeAccountId) {
      const remainingPayoutCents = Math.round((payment.barber_payout_cents * remainingValueCents) / totalValueCents);
      try {
        const transfer = await getStripe().transfers.create({
          amount: remainingPayoutCents,
          currency: "eur",
          destination: barberStripeAccountId,
        });
        const remainingAmountCents = payment.amount_cents - (refundAmountCents ?? payment.amount_cents);
        await service
          .from("payments")
          .update({
            escrow_state: "released",
            amount_cents: remainingAmountCents,
            platform_fee_cents: remainingAmountCents - remainingPayoutCents,
            barber_payout_cents: remainingPayoutCents,
            refunded_at: new Date().toISOString(),
            released_at: new Date().toISOString(),
            stripe_transfer_id: transfer.id,
          })
          .eq("id", payment.id);
      } catch (err) {
        // De terugbetaling aan de klant is op dit punt al gelukt bij
        // Stripe — alleen de uitbetaling aan de barber is mislukt. Geen
        // "geschil niet gewijzigd" melden (dat zou hier onwaar zijn); wel
        // duidelijk maken dat handmatig ingrijpen nodig is.
        return NextResponse.json(
          {
            error: `Klant is teruggestort, maar het uitbetalen van het overige bedrag aan de barber is mislukt: ${(err as Error).message}. Het geschil is nog niet afgesloten — probeer het opnieuw of betaal de barber handmatig via het Stripe-dashboard.`,
          },
          { status: 502 }
        );
      }
      resolutionNotes = `Gedeeltelijk terugbetaald (${refundSummaryParts.join(", ")}), barber uitbetaald voor de rest`;
      isPartialRefund = true;
    } else {
      await service
        .from("payments")
        .update({ escrow_state: "refunded", refunded_at: new Date().toISOString() })
        .eq("id", payment.id);
      resolutionNotes = "Terugbetaald aan klant";
    }

    await service
      .from("disputes")
      .update({ status: "resolved", resolution_notes: resolutionNotes, resolved_at: new Date().toISOString() })
      .eq("id", disputeId);
  } else {
    await service
      .from("disputes")
      .update({ status: "dismissed", resolution_notes: resolutionNotes, resolved_at: new Date().toISOString() })
      .eq("id", disputeId);
  }

  // Beide partijen informeren over de uitkomst — insert in notifications
  // is het enige integratiepunt nodig (zie fan_out_notification, Fase 8):
  // dezelfde rij levert automatisch zowel de in-app melding als de
  // e-mail op, voor klant én barber.
  const serviceName = booking?.service_name_snapshot ?? "je boeking";
  const customerBody =
    resolution === "refund"
      ? `Je hebt een terugbetaling ontvangen voor ${serviceName}.`
      : `We hebben je melding over ${serviceName} beoordeeld. De betaling is aan de barber uitbetaald.`;
  const barberBody =
    resolution === "refund"
      ? isPartialRefund
        ? `Het gemelde probleem over ${serviceName} is opgelost met een gedeeltelijke terugbetaling aan de klant. Je bent al uitbetaald voor het deel dat niet is terugbetaald.`
        : `Het gemelde probleem over ${serviceName} is opgelost: de klant heeft een terugbetaling ontvangen.`
      : `Het gemelde probleem over ${serviceName} is beoordeeld en de betaling is aan jou vrijgegeven.`;

  const notifyRows = [];
  if (booking?.customer_id) {
    notifyRows.push({
      user_id: booking.customer_id,
      type: "dispute" as const,
      title: "Geschil opgelost",
      body: customerBody,
      related_booking_id: dispute.booking_id,
    });
  }
  if (booking?.barber_id) {
    notifyRows.push({
      user_id: booking.barber_id,
      type: "dispute" as const,
      title: "Geschil opgelost",
      body: barberBody,
      related_booking_id: dispute.booking_id,
    });
  }
  if (notifyRows.length > 0) {
    await service.from("notifications").insert(notifyRows);
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: resolution === "refund" ? "dispute_refunded" : "dispute_dismissed",
    targetType: "dispute",
    targetId: disputeId,
  });

  return NextResponse.json({ success: true });
}
