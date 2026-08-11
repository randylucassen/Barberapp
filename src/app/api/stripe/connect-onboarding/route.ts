import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "barber") {
    return NextResponse.json({ error: "Alleen voor barbers" }, { status: 403 });
  }

  const { data: barberProfile } = await supabase
    .from("barber_profiles")
    .select("stripe_account_id")
    .eq("id", userData.user.id)
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
      email: userData.user.email,
      capabilities: { transfers: { requested: true } },
    });
    accountId = account.id;
    await supabase.from("barber_profiles").update({ stripe_account_id: accountId }).eq("id", userData.user.id);
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
