import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin, logAdminAction } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";

// Er bestaat nu nog geen enkel ander schrijfpad naar een review-delete
// (zelfs de eigenaar kan een review niet verwijderen, zie 0003) — de
// nieuwe on_review_deleted-trigger (0016) herberekent
// barber_profiles.rating_avg/rating_count automatisch.
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "admin-mutation", requests: 30, window: "60 s" });
  if (limited) return limited;

  const { reviewId } = (await request.json()) as { reviewId?: string };
  if (!reviewId) {
    return NextResponse.json({ error: "reviewId is verplicht" }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error } = await service.from("reviews").delete().eq("id", reviewId).select("id");
  if (error) {
    return NextResponse.json({ error: "Verwijderen is niet gelukt" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Review niet gevonden" }, { status: 404 });
  }

  await logAdminAction(service, {
    adminId: admin.id,
    action: "review_deleted",
    targetType: "review",
    targetId: reviewId,
  });

  return NextResponse.json({ success: true });
}
