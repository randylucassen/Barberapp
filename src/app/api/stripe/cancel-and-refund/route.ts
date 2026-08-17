import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { cancellationFeeApplies, CANCELLATION_FEE_PERCENTAGE } from "@/lib/booking-timing";
import { PLATFORM_FEE_RATE, euro } from "@/lib/pricing";

// Stripe stort een refund altijd terug op de oorspronkelijke betaalmethode
// (iDEAL -> bank, kaart -> kaart) — nooit naar een andere rekening en nooit
// als wallet-tegoed. Doorlooptijd verschilt per betaalmethode maar 5-10
// werkdagen is Stripe's eigen indicatie voor beide, dus één vaste tekst
// i.p.v. de werkelijke betaalmethode per keer op te zoeken.
const REFUND_TIMING_NOTE =
  "Het terugbetaalde bedrag gaat naar je oorspronkelijke betaalmethode (bank bij iDEAL, kaart bij een kaartbetaling) en is meestal binnen 5-10 werkdagen zichtbaar.";

export async function POST(request: NextRequest) {
  const { bookingId, cancelledReason } = (await request.json()) as {
    bookingId?: string;
    cancelledReason?: string;
  };
  if (!bookingId || !cancelledReason) {
    return NextResponse.json({ error: "bookingId en cancelledReason zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id, barber_id, status, requested_asap, scheduled_at")
    .eq("id", bookingId)
    .single();
  if (!booking) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }

  const cancelledBy =
    booking.customer_id === userData.user.id
      ? "customer"
      : booking.barber_id === userData.user.id
        ? "barber"
        : null;
  if (!cancelledBy) {
    return NextResponse.json({ error: "Geen toegang tot deze boeking" }, { status: 403 });
  }

  // Late-annuleringskosten gelden alleen als de klánt zelf annuleert (niet
  // als de barber annuleert — dat is niet de klant z'n schuld) en alleen
  // op basis van de staat van vóór deze update (isRideDue/scheduled_at op
  // dit moment, niet ná het zetten van status='cancelled').
  const feeApplies = cancelledBy === "customer" && cancellationFeeApplies({
    status: booking.status,
    requestedAsap: booking.requested_asap,
    scheduledAt: booking.scheduled_at,
  });

  // Zelfde update als de bestaande directe client-call — loopt via de
  // gebruikers-sessie (niet de service role), dus check_booking_status_
  // transition() valideert de overgang precies zoals altijd. Geen
  // bypass van die logica, alleen de refund-stap eronder is nieuw.
  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancelled_by: cancelledBy, cancelled_reason: cancelledReason })
    .eq("id", bookingId);

  if (updateError) {
    return NextResponse.json({ error: "Annuleren is niet gelukt — mogelijk is de status al gewijzigd." }, { status: 409 });
  }

  const service = createServiceClient();
  const { data: payment } = await service
    .from("payments")
    .select("id, stripe_payment_intent_id, escrow_state, amount_cents, platform_fee_cents, barber_payout_cents")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (payment && payment.escrow_state === "held" && payment.stripe_payment_intent_id) {
    // De fee kan alleen daadwerkelijk uitbetaald worden aan een barber met
    // een werkende Stripe Connect-koppeling — zonder die koppeling zou het
    // ingehouden bedrag nergens heen kunnen (geen "half vrij/half held"-
    // stand mogelijk op dit payments-record), dus dan blijft het gewoon
    // een volledige, gratis annulering i.p.v. de klant te laten betalen
    // voor iets dat de barber toch niet ontvangt.
    let barberStripeAccountId: string | null = null;
    if (feeApplies) {
      const { data: barberProfile } = await service
        .from("barber_profiles")
        .select("stripe_account_id, stripe_payouts_enabled")
        .eq("id", booking.barber_id)
        .maybeSingle();
      if (barberProfile?.stripe_account_id && barberProfile.stripe_payouts_enabled) {
        barberStripeAccountId = barberProfile.stripe_account_id;
      }
    }

    if (feeApplies && barberStripeAccountId) {
      // De servicekosten (platform_fee_cents) zijn nooit onderdeel van de
      // annuleringskosten-korting — die blijft de klant sowieso al
      // volledig betalen, los van annuleren. Alleen het dienstbedrag zelf
      // (amount_cents minus die servicekosten — "het oorspronkelijke
      // bedrag") valt onder de 50%-regel. De barber ontvangt zijn helft
      // daarvan min de normale 15% servicekosten (zelfde tarief als
      // altijd), en die 15% komt — net als anders — bovenop bij het
      // platform.
      const priceValueCents = payment.amount_cents - payment.platform_fee_cents;
      const halfPriceCents = Math.round((priceValueCents * CANCELLATION_FEE_PERCENTAGE) / 100);
      const refundCents = halfPriceCents;
      const keptAmountCents = payment.amount_cents - refundCents;
      const forfeitedBarberPayoutCents = Math.round(halfPriceCents * (1 - PLATFORM_FEE_RATE));

      await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id, amount: refundCents });

      // De generieke notify_customer_on_status_change()-trigger (0017)
      // stuurt bij het annuleren zelf al een kale "boeking geannuleerd"-
      // melding naar de barber — die weet op dat moment nog niets van een
      // bedrag, want deze berekening gebeurt hier in de route, ná die
      // trigger. Dit is dus een aparte, tweede melding specifiek over het
      // geld, niet een vervanging van die eerste.
      await service.from("notifications").insert({
        user_id: booking.customer_id,
        type: "cancelled",
        title: "Annuleringskosten in rekening gebracht",
        body: `Je hebt €${euro(refundCents)} teruggekregen. €${euro(keptAmountCents)} (incl. servicekosten) is in rekening gebracht vanwege een late annulering. ${REFUND_TIMING_NOTE}`,
        related_booking_id: bookingId,
      });

      try {
        const transfer = await getStripe().transfers.create({
          amount: forfeitedBarberPayoutCents,
          currency: "eur",
          destination: barberStripeAccountId,
        });
        await service
          .from("payments")
          .update({
            escrow_state: "released",
            amount_cents: keptAmountCents,
            platform_fee_cents: keptAmountCents - forfeitedBarberPayoutCents,
            barber_payout_cents: forfeitedBarberPayoutCents,
            refunded_at: new Date().toISOString(),
            released_at: new Date().toISOString(),
            stripe_transfer_id: transfer.id,
          })
          .eq("id", payment.id);
        await service.from("notifications").insert({
          user_id: booking.barber_id,
          type: "cancelled",
          title: "Compensatie voor late annulering",
          body: `Je hebt €${euro(forfeitedBarberPayoutCents)} ontvangen als compensatie voor een geannuleerde afspraak.`,
          related_booking_id: bookingId,
        });
      } catch (err) {
        // De klant is op dit punt al (deels) terugbetaald bij Stripe — de
        // boeking blijft geannuleerd (dat mag niet meer terugdraaien), maar
        // de uitbetaling aan de barber is mislukt en moet later alsnog
        // handmatig gebeuren. Niet de hele request laten falen, want de
        // annulering zelf is al onomkeerbaar geslaagd.
        Sentry.captureException(
          new Error(`Annuleringskosten-transfer naar barber mislukt voor boeking ${bookingId}: ${(err as Error).message}`)
        );
      }
    } else {
      await getStripe().refunds.create({ payment_intent: payment.stripe_payment_intent_id });
      await service
        .from("payments")
        .update({ escrow_state: "refunded", refunded_at: new Date().toISOString() })
        .eq("id", payment.id);

      // Geldt ongeacht wie annuleert — of de klánt zelf annuleert of de
      // barber (bv. ziek), de klant krijgt hier hoe dan ook zijn volledige
      // geld terug en wil weten waar dat naartoe gaat. De bestaande
      // trigger stuurt bij een barber-annulering al een "boeking
      // geannuleerd"-melding, maar noemt geen bedrag — deze is daar een
      // aanvulling op, niet een vervanging.
      await service.from("notifications").insert({
        user_id: booking.customer_id,
        type: "cancelled",
        title: "Betaling terugbetaald",
        body: `Je hebt €${euro(payment.amount_cents)} terugbetaald gekregen. ${REFUND_TIMING_NOTE}`,
        related_booking_id: bookingId,
      });
    }
  }

  return NextResponse.json({ success: true });
}
