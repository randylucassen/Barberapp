import { AdminShell } from "@/components/admin/AdminShell";
import { ReviewsTable } from "@/components/admin/ReviewsTable";
import { createServiceClient } from "@/lib/supabase/service";
import { getReviewsForAdmin } from "@/lib/supabase/queries";

export default async function AdminReviewsPage() {
  const supabase = createServiceClient();
  const reviews = await getReviewsForAdmin(supabase);

  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-4">Reviews</div>
      <ReviewsTable reviews={reviews} />
    </AdminShell>
  );
}
