"use client";
import { Clock, MapPin, Scissors } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Dialog, NavBar } from "@/components/ui";
import { Avatar, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  claimBooking,
  getBookingCustomerName,
  getBookingServiceLines,
  getConflictingScheduledBooking,
  getOpenBroadcastRequestForBarber,
  getPendingRequestForBarber,
  updateBookingStatus,
} from "@/lib/supabase/queries";
import { computePriceBreakdown, euro } from "@/lib/pricing";
import type { BookingRecord, BookingServiceLine } from "@/lib/types";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const RESPONSE_WINDOW_SEC = 5 * 60;

function formatCountdown(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RequestPage() {
  const router = useRouter();
  const [sec, setSec] = useState(RESPONSE_WINDOW_SEC);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [lines, setLines] = useState<BookingServiceLine[]>([]);
  const [isBroadcast, setIsBroadcast] = useState(false);
  const [customerName, setCustomerName] = useState("Klant");
  const [busy, setBusy] = useState(false);
  const [takenError, setTakenError] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<BookingRecord | null>(null);
  const userIdRef = useRef<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      userIdRef.current = data.user.id;

      const pending = await getPendingRequestForBarber(supabase, data.user.id);
      if (pending) {
        setBooking(pending);
        setLines(await getBookingServiceLines(supabase, pending.id));
        const name = await getBookingCustomerName(supabase, pending.id);
        if (name) setCustomerName(name);
        return;
      }

      const broadcast = await getOpenBroadcastRequestForBarber(supabase);
      if (!broadcast) {
        router.replace("/barber/dashboard");
        return;
      }
      setBooking(broadcast);
      setLines(await getBookingServiceLines(supabase, broadcast.id));
      setIsBroadcast(true);
      // Bij een automatisch-toegewezen aanvraag is de klantnaam pas
      // zichtbaar ná claimen (get_booking_customer_name vereist dat
      // barber_id al bij mij hoort) — toon nu een generieke placeholder.
      setCustomerName("Nieuwe klant");
    })();
  }, [router]);

  async function decline() {
    if (!booking || handledRef.current) return;
    handledRef.current = true;
    if (isBroadcast) {
      // Niets annuleren — andere geschikte barbers mogen deze aanvraag
      // nog steeds zien en claimen.
      router.push("/barber/dashboard");
      return;
    }
    // Rechtstreeks-toegewezen aanvraag: is altijd al betaald (barbers zien
    // een boeking überhaupt pas na succesvolle betaling, zie 0009), dus
    // weigeren moet de klant automatisch terugbetalen.
    await fetch("/api/stripe/cancel-and-refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: booking.id, cancelledReason: "Geweigerd door barber" }),
    });
    router.push("/barber/dashboard");
  }

  useEffect(() => {
    if (!booking) return;
    const t = setInterval(() => setSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [booking]);

  useEffect(() => {
    if (sec === 0 && booking) decline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec]);

  // Uitgevoerd het echte accepteren — losgetrokken van accept() zodat de
  // botsingsdialoog hieronder deze pas na bevestigen hoeft aan te roepen.
  async function performAccept() {
    if (!booking) return;
    handledRef.current = true;
    setBusy(true);
    setAcceptError(null);
    const supabase = createClient();
    // Een geplande (niet-asap) boeking moet niet meteen de rit-flow in —
    // die opent pas zodra de barber zelf op "Start rit" drukt (binnen het
    // 2-uur-venster, zie isRideDue/barber/dashboard). Terug naar het
    // dashboard laat de nieuwe "Geplande afspraken"-sectie 'm meteen zien.
    const destination = booking.requestedAsap ? "/barber/rit" : "/barber/dashboard";

    if (isBroadcast) {
      const barberId = userIdRef.current;
      if (!barberId) return;
      const { success } = await claimBooking(supabase, booking.id, barberId);
      if (success) {
        router.push(destination);
      } else {
        setTakenError(true);
        setBusy(false);
        handledRef.current = false;
      }
      return;
    }

    const ok = await updateBookingStatus(supabase, booking.id, "accepted");
    if (ok) {
      router.push(destination);
    } else {
      handledRef.current = false;
      setBusy(false);
      setAcceptError("Accepteren is niet gelukt. Probeer het opnieuw.");
    }
  }

  async function accept() {
    if (!booking || handledRef.current) return;
    // Alleen voor een geplande aanvraag de moeite waard om te checken —
    // een asap-aanvraag heeft geen vast tijdvak om mee te botsen.
    if (!booking.requestedAsap && booking.scheduledAt) {
      const barberId = userIdRef.current;
      if (barberId) {
        setBusy(true);
        const supabase = createClient();
        const found = await getConflictingScheduledBooking(
          supabase,
          barberId,
          booking.scheduledAt,
          booking.durationMinutes
        );
        setBusy(false);
        if (found) {
          setConflict(found);
          return;
        }
      }
    }
    await performAccept();
  }

  if (takenError) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-7 text-center">
        <div className="text-[20px] font-bold tracking-[-0.01em]">Deze aanvraag is al vergeven</div>
        <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
          Een andere barber was je net voor. Er kunnen nieuwe aanvragen binnenkomen.
        </div>
        <Button full className="mt-6" onClick={() => router.push("/barber/dashboard")}>Naar dashboard</Button>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-text-secondary">Laden…</div>
    );
  }

  const earningCents = computePriceBreakdown(booking.priceCents).barberPayoutCents;

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Nieuwe aanvraag" onBack={() => router.push("/barber/dashboard")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <Card variant="outline" padding={16}>
          <div className="flex gap-3.5 items-center">
            <Avatar name={customerName} size={56} />
            <div className="flex-1">
              <div className="text-[16px] font-semibold">{customerName}</div>
              {isBroadcast && <div className="text-[12px] text-text-tertiary mt-0.5">Automatisch toegewezen</div>}
            </div>
            <Badge variant="accent">{booking.requestedAsap ? "Nu" : "Gepland"}</Badge>
          </div>
        </Card>
        <div className="mt-3">
          {lines.length > 0 ? (
            lines.map((l) => (
              <Row
                key={l.id}
                left={<span className="text-primary"><Scissors size={20} /></span>}
                title={l.quantity > 1 ? `${l.quantity}x ${l.serviceName}` : l.serviceName}
                sub={`${l.unitDurationMinutes * l.quantity} min`}
                right={<span className="font-bold text-[17px]">€{euro(l.unitPriceCents * l.quantity)}</span>}
              />
            ))
          ) : (
            <Row
              left={<span className="text-primary"><Scissors size={20} /></span>}
              title={booking.serviceName}
              sub={`${booking.durationMinutes} min`}
              right={<span className="font-bold text-[17px]">€{euro(booking.priceCents)}</span>}
            />
          )}
          <Row left={<span className="text-primary"><MapPin size={20} /></span>} title={booking.address} />
          <Row
            left={<span className="text-primary"><Clock size={20} /></span>}
            title={booking.requestedAsap ? "Zo snel mogelijk" : "Ingepland"}
          />
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
      <div className="px-5 pt-3 pb-2 border-t border-border">
        <div className="text-center text-[13px] text-text-tertiary mb-2.5">Reageert automatisch af over {formatCountdown(sec)}</div>
        {acceptError && (
          <div className="mb-2 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {acceptError}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button full variant="accent" disabled={busy} onClick={accept}>
            {busy ? "Bezig…" : `Accepteer · €${euro(earningCents)}`}
          </Button>
          <Button full variant="ghost" disabled={busy} onClick={decline}>Weiger</Button>
        </div>
      </div>
      <Dialog
        open={!!conflict}
        title="Overlapt met een andere afspraak"
        onClose={() => setConflict(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConflict(null)}>Annuleer</Button>
            <Button variant="accent" onClick={() => { setConflict(null); performAccept(); }}>Toch accepteren</Button>
          </>
        }
      >
        <div className="text-[14px] text-text-secondary leading-[20px]">
          Je hebt al een bevestigde afspraak — <b className="text-text-primary">{conflict?.serviceName}</b>
          {conflict?.scheduledAt && ` op ${formatDateTime(conflict.scheduledAt)}`} — die overlapt met deze
          aanvraag. Weet je zeker dat je &apos;m ook wilt accepteren?
        </div>
      </Dialog>
    </div>
  );
}
