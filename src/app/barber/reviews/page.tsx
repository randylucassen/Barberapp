"use client";
import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/ui";
import { Avatar } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile, getReviewsForBarber } from "@/lib/supabase/queries";
import type { BarberProfile, ReviewRecord } from "@/lib/types";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.round(hours / 24);
  return `${days} d geleden`;
}

export default function ReviewsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<BarberProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const [p, r] = await Promise.all([
        getBarberProfile(supabase, data.user.id),
        getReviewsForBarber(supabase, data.user.id),
      ]);
      setProfile(p);
      setReviews(r);
    })();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Reviews" onBack={() => router.push("/barber/profiel")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[40px] font-bold tracking-[-0.02em]">
            {profile?.ratingAvg ? profile.ratingAvg.toFixed(1).replace(".", ",") : "–"}
          </span>
          <span className="text-primary flex"><Star size={20} fill="currentColor" /></span>
          <span className="text-[14px] text-text-secondary">{profile?.ratingCount ?? 0} reviews</span>
        </div>
        <div className="mt-3">
          {reviews.length === 0 && (
            <div className="text-[14px] text-text-secondary py-4">Nog geen reviews.</div>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="py-4 border-b border-border-soft">
              <div className="flex items-center gap-2.5">
                <Avatar name={r.reviewerName} size={36} />
                <div className="flex-1">
                  <div className="text-[15px] font-semibold">{r.reviewerName}</div>
                  <div className="text-[12px] text-text-tertiary">{timeAgo(r.createdAt)}</div>
                </div>
                <div className="flex gap-0.5 text-primary">
                  {Array.from({ length: r.stars }, (_, i) => (
                    <Star key={i} size={13} fill="currentColor" />
                  ))}
                </div>
              </div>
              {r.text && <div className="text-[14px] text-[#374151] leading-5 mt-2.5">{r.text}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
