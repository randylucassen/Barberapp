import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { code, discountType, value, maxUses, validUntil } = (await request.json()) as {
    code?: string;
    discountType?: "percentage" | "fixed";
    value?: number;
    maxUses?: number | null;
    validUntil?: string | null;
  };
  if (!code || !discountType || !Number.isInteger(value) || value! <= 0) {
    return NextResponse.json({ error: "code, discountType en een geldige value zijn verplicht" }, { status: 400 });
  }
  if (discountType === "percentage" && value! > 100) {
    return NextResponse.json({ error: "Een percentage-korting kan niet boven de 100 zijn" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: created, error } = await service
    .from("discount_codes")
    .insert({
      code: code.trim().toUpperCase(),
      discount_type: discountType,
      value,
      max_uses: maxUses ?? null,
      valid_until: validUntil || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "Aanmaken is niet gelukt" }, { status: 500 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: "discount_code_created",
    targetType: "discount_code",
    targetId: created.id,
    detail: code.trim().toUpperCase(),
  });

  return NextResponse.json({ success: true });
}
