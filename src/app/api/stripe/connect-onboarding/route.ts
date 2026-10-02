import { NextRequest, NextResponse } from "next/server";
import { createClient, getRequestUser } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  // getRequestUser(): zelfde Bearer-fallback als cancel-and-refund e.a. —
  // groomy-app's uitbetalingen-scherm (Fase B3) roept deze route zelf aan
  // om de Stripe-hosted-onboarding-link op te halen.
  const { user, supabase } = await getRequestUser(request, await createClient());
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "barber") {
    return NextResponse.json({ error: "Alleen voor barbers" }, { status: 403 });
  }

  const { data: barberProfile } = await supabase
    .from("barber_profiles")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  let accountId = barberProfile?.stripe_account_id ?? null;

  if (!accountId) {
    // Express-account: Stripe host de volledige onboarding (KYC,
    // bankgegevens) — wij slaan nooit een rekeningnummer zelf op. Alleen
    // de transfers-capability nodig, want de klant betaalt het platform
    // (separate charges and transfers), niet de connected account direct.
    const account = await getStripe().accounts.create({
      type: "express",
      country: "NL",
      email: user.email,
      capabilities: { transfers: { requested: true } },
    });
    accountId = account.id;
    await supabase.from("barber_profiles").update({ stripe_account_id: accountId }).eq("id", user.id);
  }

  const origin = request.nextUrl.origin;
  const accountLink = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/barber/uitbetalingen`,
    return_url: `${origin}/barber/uitbetalingen`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
