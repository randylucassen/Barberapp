import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { recordSucceededPaymentIntent } from "@/lib/payment-reconcile";
import { checkRateLimit } from "@/lib/rate-limit";

// Actief-navragen-tegenhanger van de webhook/reconcile-cron: klant/succes
// roept dit meteen aan zodra 'ie landt (met de payment_intent-id die
// Stripe zelf al meegeeft, via de return_url-redirect of het directe
// confirmPayment()-resultaat) i.p.v. puur te wachten tot de webhook
// afgeleverd wordt of de reconcile-payments-cron (elke 2 min) 'm oppikt.
// Gebruikt dezelfde recordSucceededPaymentIntent() als beide — dus geen
// aparte/afwijkende schrijflogica, alleen een derde, snellere trigger.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "confirm-payment", requests: 20, window: "60 s" });
  if (limited) return limited;

  const { bookingId, paymentIntentId } = (await request.json()) as {
    bookingId?: string;
    paymentIntentId?: string;
  };
  if (!bookingId || !paymentIntentId) {
    return NextResponse.json({ error: "bookingId en paymentIntentId zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, customer_id")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.customer_id !== userData.user.id) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }

  const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
  if (paymentIntent.metadata.bookingId !== bookingId) {
    return NextResponse.json({ error: "PaymentIntent hoort niet bij deze boeking" }, { status: 400 });
  }

  if (paymentIntent.status !== "succeeded") {
    return NextResponse.json({ confirmed: false, status: paymentIntent.status });
  }

  const serviceClient = createServiceClient();
  await recordSucceededPaymentIntent(serviceClient, paymentIntent);
  return NextResponse.json({ confirmed: true });
}
