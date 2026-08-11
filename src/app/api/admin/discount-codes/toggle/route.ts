import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { discountCodeId, active } = (await request.json()) as { discountCodeId?: string; active?: boolean };
  if (!discountCodeId || typeof active !== "boolean") {
    return NextResponse.json({ error: "discountCodeId en active zijn verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("discount_codes")
    .update({ active })
    .eq("id", discountCodeId)
    .select("id");
  if (error) {
    return NextResponse.json({ error: "Bijwerken is niet gelukt" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Kortingscode niet gevonden" }, { status: 404 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: active ? "discount_code_activated" : "discount_code_deactivated",
    targetType: "discount_code",
    targetId: discountCodeId,
  });

  return NextResponse.json({ success: true });
}
