"use client";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { AdminReviewRow } from "@/lib/supabase/queries";

export function ReviewsTable({ reviews }: { reviews: AdminReviewRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(reviewId: string) {
    if (!confirm("Deze review permanent verwijderen?")) return;
    setBusyId(reviewId);
    setError(null);
    const res = await fetch("/api/admin/reviews/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewId }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Verwijderen is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  if (reviews.length === 0) {
    return <div className="text-[14px] text-text-secondary">Geen reviews.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{error}</div>
      )}
      {reviews.map((r) => (
        <div key={r.id} className="bg-white border border-border rounded-lg p-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1 text-primary">
              {Array.from({ length: r.stars }).map((_, i) => (
                <Star key={i} size={14} fill="currentColor" />
              ))}
            </div>
            <div className="text-[13px] text-text-secondary mt-1">
              {r.customerName} → {r.barberName}
            </div>
            {r.text && <div className="text-[14px] mt-1.5">{r.text}</div>}
          </div>
          <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => handleDelete(r.id)}>
            Verwijderen
          </Button>
        </div>
      ))}
    </div>
  );
}
