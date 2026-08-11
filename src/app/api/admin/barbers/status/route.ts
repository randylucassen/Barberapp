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
