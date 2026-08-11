"use client";
import { Heart, Star } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Input, NavBar } from "@/components/ui";
import { Avatar } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { addFavoriteBarber, createReview, getBooking, getReviewForBooking } from "@/lib/supabase/queries";
import type { BookingRecord } from "@/lib/types";

function ReviewContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");

  const [userId, setUserId] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [barberName, setBarberName] = useState<string | null>(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) setUserId(data.user.id);

      const [b, existingReview] = await Promise.all([
        getBooking(supabase, bookingId),
        getReviewForBooking(supabase, bookingId),
      ]);
      setBooking(b);
      setAlreadyReviewed(!!existingReview);

      if (b?.barberId) {
        const { data: barberRow } = await supabase
          .from("approved_barbers")
          .select("full_name")
          .eq("id", b.barberId)
          .single();
        if (barberRow) setBarberName(barberRow.full_name);
      }
      setLoading(false);
    })();
  }, [bookingId]);

  async function handleSubmit() {
    if (!bookingId || !userId || !booking?.barberId || stars === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const supabase = createClient();
    const ok = await createReview(supabase, {
      bookingId,
      customerId: userId,
      barberId: booking.barberId,
      stars,
      text: text.trim() || null,
    });
    if (ok && favorite) {
      await addFavoriteBarber(supabase, userId, booking.barberId);
    }
    setSubmitting(false);
    if (ok) {
      router.push("/klant/home");
    } else {
      setSubmitError("Versturen is niet gelukt. Probeer het opnieuw.");
    }
  }

  if (loading) {
    return <div className="flex flex-col h-full items-center justify-center text-text-secondary">Laden…</div>;
  }

  if (!bookingId || !booking || booking.status !== "completed") {
    return (
      <div className="flex flex-col h-full">
        <NavBar onBack={() => router.push("/klant/home")} />
        <div className="flex-1 flex items-center justify-center px-7 text-center text-text-secondary">
          Deze boeking kan niet beoordeeld worden.
        </div>
      </div>
    );
  }

  if (alreadyReviewed) {
    return (
      <div className="flex flex-col h-full">
        <NavBar onBack={() => router.push("/klant/home")} />
        <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
          <div className="text-[20px] font-bold tracking-[-0.01em]">Je hebt deze boeking al beoordeeld</div>
          <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
            Bedankt voor je review — je kunt een boeking maar één keer beoordelen.
          </div>
          <Button full className="mt-6" onClick={() => router.push("/klant/home")}>Naar home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar onBack={() => router.push("/klant/home")} />
      <div className="px-5 pt-2 flex-1 overflow-y-auto no-scrollbar text-center">
        <div className="flex justify-center mt-2">
          <Avatar name={barberName ?? "Barber"} size={72} dark />
        </div>
        <div className="text-[24px] font-bold tracking-[-0.02em] mt-4">
          Hoe was {barberName?.split(" ")[0] ?? "je barber"}?
        </div>
        <div className="text-[14px] text-text-secondary mt-1">{booking.serviceName}</div>
        <div className="flex justify-center gap-2 mt-6">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              onClick={() => setStars(n)}
              className={`cursor-pointer transition-colors duration-fast ${n <= stars ? "text-primary" : "text-border"}`}
            >
              <Star size={36} fill={n <= stars ? "currentColor" : "none"} />
            </span>
          ))}
        </div>
        {stars >= 4 && (
          <button
            type="button"
            onClick={() => setFavorite((f) => !f)}
            className={`mt-5 inline-flex items-center gap-2 text-[14px] font-medium rounded-full px-4 py-2 border ${
              favorite ? "border-error text-error bg-error-soft" : "border-border text-text-secondary"
            }`}
          >
            <Heart size={16} fill={favorite ? "currentColor" : "none"} />
            {favorite ? "Favoriet" : `Zet ${barberName?.split(" ")[0] ?? "deze barber"} als favoriet`}
          </button>
        )}
        <div className="mt-8 text-left">
          <Input
            placeholder="Schrijf een korte review (optioneel)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>
      <div className="px-5 pt-3 pb-2">
        {submitError && (
          <div className="mb-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {submitError}
          </div>
        )}
        <Button full variant="accent" disabled={stars === 0 || submitting} onClick={handleSubmit}>
          {submitting ? "Bezig…" : "Verstuur"}
        </Button>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewContent />
    </Suspense>
  );
}
