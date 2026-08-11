import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Klanten hebben geen statuskolom zoals barbers (barber_status) —
// schorsen gebeurt via profiles.suspended. Barbers worden geschorst via
// /api/admin/barbers/status (hergebruikt de al bestaande
// barber_status = 'suspended'-waarde uit Fase 1/2).
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { customerId, suspended } = (await request.json()) as { customerId?: string; suspended?: boolean };
  if (!customerId || typeof suspended !== "boolean") {
    return NextResponse.json({ error: "customerId en suspended zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .update({ suspended })
    .eq("id", customerId)
    .eq("role", "customer")
    .select("id");
  if (error) {
    return NextResponse.json({ error: "Bijwerken is niet gelukt" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Klant niet gevonden" }, { status: 404 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: suspended ? "customer_suspended" : "customer_unsuspended",
    targetType: "profile",
    targetId: customerId,
  });

  return NextResponse.json({ success: true });
}
