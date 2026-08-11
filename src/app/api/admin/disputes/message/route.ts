import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getResend, notificationEmailHtml } from "@/lib/resend";

// Laat een admin eerst contact opnemen met klant en/of barber voordat
// een geschil wordt opgelost (terugbetalen/vrijgeven) — voorheen kon
// alleen direct één van die twee acties gekozen worden, zonder eerst te
// kunnen uitzoeken wat er precies gebeurd is. Bewust e-mail i.p.v. een
// in-app threadscherm (kleinere wijziging, hergebruikt de bestaande
// Resend-integratie uit Fase 8) — antwoorden komen gewoon terug in de
// mailbox van RESEND_FROM_EMAIL, geen nieuwe tabel/UI nodig. Elk bericht
// wordt als detail in admin_action_log gezet, dus zichtbaar in /admin/
// logboek als informeel audit-spoor.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { disputeId, recipient, message } = (await request.json()) as {
    disputeId?: string;
    recipient?: "customer" | "barber" | "both";
    message?: string;
  };
  if (!disputeId || !message?.trim() || (recipient !== "customer" && recipient !== "barber" && recipient !== "both")) {
    return NextResponse.json({ error: "disputeId, recipient en message zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: dispute } = await service
    .from("disputes")
    .select("id, booking_id, reason")
    .eq("id", disputeId)
    .single();
  if (!dispute) {
    return NextResponse.json({ error: "Geschil niet gevonden" }, { status: 404 });
  }

  const { data: booking } = await service
    .from("bookings")
    .select("service_name_snapshot, customer_id, barber_id")
    .eq("id", dispute.booking_id)
    .single();
  if (!booking) {
    return NextResponse.json({ error: "Boeking niet gevonden" }, { status: 404 });
  }

  const targetIds = [
    ...(recipient === "customer" || recipient === "both" ? [booking.customer_id] : []),
    ...(recipient === "barber" || recipient === "both" ? [booking.barber_id] : []),
  ].filter((id): id is string => !!id);

  const { data: profiles } = await service.from("profiles").select("id, email, full_name").in("id", targetIds);

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ error: "Geen e-mailadres gevonden voor de gekozen ontvanger(s)" }, { status: 404 });
  }

  const title = `Over je geschil: ${booking.service_name_snapshot}`;
  const results: { email: string; outcome: string }[] = [];

  for (const profile of profiles) {
    if (!profile.email) {
      results.push({ email: "(onbekend)", outcome: "geen e-mailadres" });
      continue;
    }
    try {
      const { error } = await getResend().emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: profile.email,
        subject: title,
        html: notificationEmailHtml(title, message),
      });
      results.push({ email: profile.email, outcome: error ? `mislukt: ${error.message}` : "verstuurd" });
    } catch (err) {
      results.push({ email: profile.email, outcome: `mislukt: ${(err as Error).message}` });
    }
  }

  if (!results.some((r) => r.outcome === "verstuurd")) {
    return NextResponse.json({ error: "Versturen is niet gelukt", results }, { status: 502 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: "dispute_message_sent",
    targetType: "dispute",
    targetId: disputeId,
    detail: `Aan ${recipient === "both" ? "klant en barber" : recipient === "customer" ? "klant" : "barber"}: "${message.trim()}"`,
  });

  return NextResponse.json({ success: true, results });
}
