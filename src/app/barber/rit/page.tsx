"use client";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, IconButton, NavBar } from "@/components/ui";
import { Avatar } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getActiveBookingForBarber, getBookingCustomerName, updateBookingStatus } from "@/lib/supabase/queries";
import { computePriceBreakdown, euro } from "@/lib/pricing";
import type { BookingRecord, BookingStatus } from "@/lib/types";

const STAGE: Record<
  "accepted" | "en_route" | "arrived" | "in_progress",
  { badge: string; badgeVariant: "accent" | "success"; next: BookingStatus; cta: string }
> = {
  accepted: { badge: "Bevestigd", badgeVariant: "accent", next: "en_route", cta: "Vertrek" },
  en_route: { badge: "Onderweg", badgeVariant: "accent", next: "arrived", cta: "Ik ben er" },
  arrived: { badge: "Aangekomen", badgeVariant: "success", next: "in_progress", cta: "Start knipbeurt" },
  in_progress: { badge: "Bezig", badgeVariant: "success", next: "completed", cta: "Rond af" },
};

export default function RidePage() {
  const router = useRouter();
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [customerName, setCustomerName] = useState("Klant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const active = await getActiveBookingForBarber(supabase, data.user.id);
      if (!active) {
        router.replace("/barber/dashboard");
        return;
      }
      setBooking(active);
      const name = await getBookingCustomerName(supabase, active.id);
      if (name) setCustomerName(name);
    })();
  }, [router]);

  async function advance() {
    if (!booking) return;
    const stage = STAGE[booking.status as keyof typeof STAGE];
    if (!stage) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const ok = await updateBookingStatus(supabase, booking.id, stage.next);
    setBusy(false);
    if (!ok) {
      setError("Dit is niet gelukt. Probeer het opnieuw.");
      return;
    }

    if (stage.next === "completed") {
      router.push("/barber/verdiensten?done=1");
      return;
    }
    setBooking({ ...booking, status: stage.next });
  }

  if (!booking) {
    return <div className="flex flex-col h-full items-center justify-center text-text-secondary">Laden…</div>;
  }

  const stage = STAGE[booking.status as keyof typeof STAGE];
  const earningCents = computePriceBreakdown(booking.priceCents).barberPayoutCents;
  const firstName = customerName.split(" ")[0];

  const title =
    booking.status === "accepted" || booking.status === "en_route"
      ? `Onderweg naar ${firstName}`
      : booking.status === "arrived"
        ? "Ter plaatse"
        : "Bezig met knippen";

  const sub =
    booking.status === "in_progress" ? `${booking.serviceName} · ${booking.durationMinutes} min` : booking.address;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 bg-[#F1F3F4] relative">
        <NavBar transparent onBack={() => router.push("/barber/dashboard")} />
        <div className="absolute inset-0 flex items-center justify-center text-[#C6CBD1] flex-col gap-2">
          <MapPin size={40} />
          <span className="text-[13px] font-medium">Navigatie</span>
        </div>
      </div>
      <div className="bg-white rounded-t-xl -mt-6 px-5 pt-5 pb-2 relative">
        <div className="w-9 h-1 rounded-full bg-border mx-auto mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[22px] font-bold tracking-[-0.01em]">{title}</div>
            <div className="text-[15px] text-text-secondary mt-0.5">{sub}</div>
          </div>
          {stage && <Badge variant={stage.badgeVariant}>{stage.badge}</Badge>}
        </div>
        <div className="flex gap-3.5 items-center mt-5 pt-4 border-t border-border-soft">
          <Avatar name={customerName} size={48} />
          <div className="flex-1">
            <div className="text-[16px] font-semibold">{customerName}</div>
            <div className="text-[13px] text-text-secondary">
              {booking.serviceName} · €{euro(earningCents)} voor jou
            </div>
          </div>
          <div className="flex gap-2">
            <IconButton label="Bericht"><MessageCircle size={18} /></IconButton>
            <IconButton label="Bel" variant="primary"><Phone size={18} /></IconButton>
          </div>
        </div>
        <div className="mt-4 mb-2">
          {error && (
            <div className="mb-2 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
              {error}
            </div>
          )}
          {stage && (
            <Button full variant="accent" disabled={busy} onClick={advance}>
              {stage.next === "completed" ? `${stage.cta} · €${euro(earningCents)}` : stage.cta}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
