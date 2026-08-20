import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const VALID_STATUSES = ["approved", "rejected", "suspended", "pending"] as const;

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { barberId, status } = (await request.json()) as { barberId?: string; status?: string };
  if (!barberId || !status || !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json({ error: "barberId en een geldige status zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();

  // Een barber mag pas geld kunnen verdienen als de factuurgegevens
  // compleet zijn — anders kan de maandelijkse btw-factuur (0038) nooit
  // gegenereerd worden en mist de administratie een verplicht document.
  // Bewust hier afgedwongen (niet alleen client-side op /barber/
  // aanmelden), want dit is de enige plek die daadwerkelijk bepaalt of
  // een barber zichtbaar/boekbaar wordt.
  if (status === "approved") {
    const { data: barberProfile } = await service
      .from("barber_profiles")
      .select("address, city, kvk_number")
      .eq("id", barberId)
      .maybeSingle();

    const missing: string[] = [];
    if (!barberProfile?.address?.trim()) missing.push("adres");
    if (!barberProfile?.city?.trim()) missing.push("stad");
    if (!barberProfile?.kvk_number?.trim()) missing.push("KvK-nummer");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Kan niet goedkeuren: barber mist nog ${missing.join(", ")} (nodig voor de maandelijkse btw-factuur).` },
        { status: 400 }
      );
    }
  }

  const { data, error } = await service
    .from("profiles")
    .update({ barber_status: status })
    .eq("id", barberId)
    .eq("role", "barber")
    .select("id");
  if (error) {
    return NextResponse.json({ error: "Bijwerken is niet gelukt" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Barber niet gevonden" }, { status: 404 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: `barber_status_${status}`,
    targetType: "profile",
    targetId: barberId,
  });

  return NextResponse.json({ success: true });
}
