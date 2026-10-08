import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createServiceClient } from "@/lib/supabase/service";
import { getResend, notificationEmailHtml } from "@/lib/resend";

// Los adres voor interne signup-meldingen — geen klant/barber-contact,
// dus bewust niet in company-info.ts (dat is de bron voor extern-
// zichtbare bedrijfsgegevens, privacybeleid/voorwaarden/e-mailvoettekst).
const ADMIN_NOTIFY_EMAIL = "kpprtje@gmail.com";

// Machine-to-machine, geen Supabase-sessie — aangeroepen door de
// on_profile_created_notify_admin-trigger (0056) via pg_net. Zelfde
// CRON_SECRET-patroon als /api/notifications/send.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { profileId } = (await request.json()) as { profileId?: string };
  if (!profileId) {
    return NextResponse.json({ error: "profileId is verplicht" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email, phone, created_at")
    .eq("id", profileId)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profiel niet gevonden" }, { status: 404 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ email: "skipped: geen RESEND_API_KEY" });
  }

  const roleLabel = profile.role === "barber" ? "Barber" : "Klant";
  const title = `Nieuwe ${roleLabel.toLowerCase()} geregistreerd`;
  const body =
    `${profile.full_name} (${profile.email}` +
    (profile.phone ? `, ${profile.phone}` : "") +
    `) heeft zich zojuist als ${roleLabel.toLowerCase()} aangemeld op KPPRTJE!.`;

  try {
    const { error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: ADMIN_NOTIFY_EMAIL,
      subject: title,
      html: notificationEmailHtml(title, body),
    });
    if (error) {
      // Zelfde reden als /api/notifications/send: de Resend SDK gooit
      // niet bij een API-fout, en deze route wordt fire-and-forget
      // aangeroepen door pg_net — zonder expliciete Sentry-capture zou
      // een mislukte verzending (bv. de sandbox-restrictie "alleen naar
      // je eigen adres", zie CLAUDE.md) stil verdwijnen.
      Sentry.captureException(new Error(`Admin-signup-mail mislukt naar ${ADMIN_NOTIFY_EMAIL}: ${error.message}`));
      return NextResponse.json({ email: `error: ${error.message}` });
    }
    return NextResponse.json({ email: "sent" });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ email: `error: ${(err as Error).message}` });
  }
}
