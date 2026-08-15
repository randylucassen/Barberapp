"use client";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, IconButton, NavBar } from "@/components/ui";
import { Avatar, LiveMap } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  getActiveBookingForBarber,
  getBookingCustomerName,
  getBookingCustomerPhone,
  updateBookingLiveLocation,
  updateBookingStatus,
} from "@/lib/supabase/queries";
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
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myLat, setMyLat] = useState<number | null>(null);
  const [myLng, setMyLng] = useState<number | null>(null);
  const [myLocationUpdatedAt, setMyLocationUpdatedAt] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const lastWriteRef = useRef<number>(0);

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
      setCustomerPhone(await getBookingCustomerPhone(supabase, active.id));
    })();
  }, [router]);

  // Live locatie bijhouden zolang de barber onderweg is ("accepted" =
  // nog niet vertrokken maar al zichtbaar voor de klant, "en_route" =
  // daadwerkelijk rijdend) — stopt vanzelf bij arrived/in_progress/
  // completed of als dit scherm verlaten wordt. Schrijft gethrottled
  // (max. 1x per 8s) naar de database, niet bij elke GPS-tick (die soms
  // elke seconde vuurt) — voorkomt onnodig veel writes.
  useEffect(() => {
    const bookingId = booking?.id;
    const status = booking?.status;
    if (!bookingId || (status !== "accepted" && status !== "en_route")) return;
    if (!navigator.geolocation) {
      setLocationError("Je browser ondersteunt geen locatiebepaling.");
      return;
    }
    const supabase = createClient();
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocationError(null);
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
        setMyLocationUpdatedAt(new Date().toISOString());
        const now = Date.now();
        if (now - lastWriteRef.current < 8000) return;
        lastWriteRef.current = now;
        updateBookingLiveLocation(supabase, bookingId, pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setLocationError(err.code === err.PERMISSION_DENIED ? "Locatietoestemming geweigerd — je rit werkt gewoon door." : "Kon je locatie niet bepalen.");
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [booking?.id, booking?.status]);

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
  const showLiveMap = booking.status === "accepted" || booking.status === "en_route";

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
        {showLiveMap ? (
          <LiveMap
            barberLat={myLat}
            barberLng={myLng}
            destinationLat={booking.lat}
            destinationLng={booking.lng}
            barberLocationUpdatedAt={myLocationUpdatedAt}
            placeholderLabel="Navigatie"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#C6CBD1] flex-col gap-2">
            <MapPin size={40} />
            <span className="text-[13px] font-medium">Navigatie</span>
          </div>
        )}
        {locationError && (
          <div className="absolute left-3 right-3 top-16 bg-white rounded-md shadow-[0_2px_8px_rgba(0,0,0,.15)] px-3 py-2 text-[13px] text-text-secondary">
            {locationError}
          </div>
        )}
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
            <IconButton
              label="Bericht"
              disabled={!customerPhone}
              onClick={() => customerPhone && (window.location.href = `sms:${customerPhone}`)}
            >
              <MessageCircle size={18} />
            </IconButton>
            <IconButton
              label="Bel"
              variant="primary"
              disabled={!customerPhone}
              onClick={() => customerPhone && (window.location.href = `tel:${customerPhone}`)}
            >
              <Phone size={18} />
            </IconButton>
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
