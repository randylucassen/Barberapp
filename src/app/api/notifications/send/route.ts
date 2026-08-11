import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { getResend, notificationEmailHtml } from "@/lib/resend";

// Machine-to-machine, geen Supabase-sessie — aangeroepen door de
// fan_out_notification-trigger (0013) via pg_net, of handmatig voor
// testen. Zelfde CRON_SECRET als de release-escrow-endpoint (Fase 6),
// hergebruikt als algemeen backend-to-backend-secret.
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = (await request.json()) as { notificationId?: string };
  if (!notificationId) {
    return NextResponse.json({ error: "notificationId is verplicht" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: notification } = await supabase
    .from("notifications")
    .select("id, user_id, title, body")
    .eq("id", notificationId)
    .single();
  if (!notification) {
    return NextResponse.json({ error: "Notificatie niet gevonden" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, email_notifications_enabled")
    .eq("id", notification.user_id)
    .single();

  const results: { email: string | null; push: number } = { email: null, push: 0 };

  if (profile?.email_notifications_enabled && profile.email && process.env.RESEND_API_KEY) {
    try {
      // De Resend SDK gooit niet bij een API-fout — die komt terug als
      // { error } in de response, moet expliciet gecontroleerd worden
      // (zelfde reden waarom overal elders in dit project { data, error }
      // van Supabase-calls ook expliciet gecheckt wordt, nooit alleen op
      // "geen exception" vertrouwd).
      const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: profile.email,
        subject: notification.title,
        html: notificationEmailHtml(notification.title, notification.body ?? ""),
      });
      results.email = error ? `error: ${error.message}` : "sent";
    } catch (err) {
      results.email = `error: ${(err as Error).message}`;
    }
  }

  if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notification.user_id);

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: notification.title, body: notification.body ?? "" })
        );
        results.push += 1;
      } catch (err) {
        // 404/410 = de subscription bestaat niet meer aan de push-service-
        // kant (browser losgekoppeld, cache gewist, enz.) — dan de rij
        // opruimen zodat we niet blijven proberen.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }
  }

  return NextResponse.json({ notificationId, ...results });
}
