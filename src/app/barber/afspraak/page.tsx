"use client";
import { MapPin, MessageCircle, Phone, Scissors } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Card, IconButton, NavBar } from "@/components/ui";
import { Avatar, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBooking, getBookingCustomerName, getBookingCustomerPhone } from "@/lib/supabase/queries";
import { computePriceBreakdown, euro } from "@/lib/pricing";
import { isRideDue } from "@/lib/booking-timing";
import type { BookingRecord } from "@/lib/types";

function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Detailscherm voor een geaccepteerde, geplande (niet-asap, nog niet due)
// boeking — bereikbaar via de "Geplande afspraken"-sectie op
// barber/dashboard. Die lijst toonde voorheen alleen een niet-klikbare
// kaart; de barber kon dus niet meer bij de klant terecht (bellen/
// berichten) of de afspraak annuleren zonder te wachten tot 'ie due werd.
function AppointmentContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [customerName, setCustomerName] = useState("Klant");
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    const supabase = createClient();
    (async () => {
      const b = await getBooking(supabase, bookingId);
      if (!b) {
        setNotFound(true);
        return;
      }
      // Eenmaal due (binnen 2 uur, zie isRideDue) hoort dit bij de
      // actieve-rit-flow — kan gebeuren als de barber dit scherm al open
      // had staan terwijl de tijd verstreek.
      if (isRideDue(b)) {
        router.replace("/barber/rit");
        return;
      }
      setBooking(b);
      const name = await getBookingCustomerName(supabase, bookingId);
      if (name) setCustomerName(name);
      setCustomerPhone(await getBookingCustomerPhone(supabase, bookingId));
    })();
  }, [bookingId, router]);

  if (notFound) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-7 text-center text-text-secondary">
        Afspraak niet gevonden.
        <Button full className="mt-4" onClick={() => router.push("/barber/dashboard")}>Naar dashboard</Button>
      </div>
    );
  }

  if (!booking) {
    return <div className="flex flex-col h-full items-center justify-center text-text-secondary">Laden…</div>;
  }

  const earningCents = computePriceBreakdown(booking.priceCents).barberPayoutCents;
  const canCancel = booking.status === "accepted";

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Geplande afspraak" onBack={() => router.push("/barber/dashboard")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <Card variant="outline" padding={16}>
          <div className="flex gap-3.5 items-center">
            <Avatar name={customerName} size={56} />
            <div className="flex-1">
              <div className="text-[16px] font-semibold">{customerName}</div>
              {booking.scheduledAt && (
                <div className="text-[13px] text-text-tertiary mt-0.5">{formatScheduledAt(booking.scheduledAt)}</div>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
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
        </Card>
        <div className="mt-3">
          <Row
            left={<span className="text-primary"><Scissors size={20} /></span>}
            title={booking.serviceName}
            sub={`${booking.durationMinutes} min`}
            right={<span className="font-bold text-[17px]">€{euro(booking.priceCents)}</span>}
          />
          <Row left={<span className="text-primary"><MapPin size={20} /></span>} title={booking.address} />
          {booking.note && (
            <div className="mt-2 bg-surface rounded-md px-4 py-3 text-[13px] text-text-secondary">
              &ldquo;{booking.note}&rdquo;
            </div>
          )}
        </div>
        <div className="mt-4 bg-accent-soft rounded-md px-4 py-3 text-[14px] text-accent-dark">
          Jouw verdienste: <b>€{euro(earningCents)}</b> (na 15% servicekosten)
        </div>
      </div>
      {canCancel && (
        <div className="px-5 pt-3 pb-2 border-t border-border">
          <Button full variant="ghost" onClick={() => router.push(`/barber/afspraak/annuleren?bookingId=${booking.id}`)}>
            Afspraak annuleren
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AppointmentPage() {
  return (
    <Suspense>
      <AppointmentContent />
    </Suspense>
  );
}
