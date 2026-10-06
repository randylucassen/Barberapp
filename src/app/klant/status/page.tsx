"use client";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge, Button, Dialog, IconButton, NavBar } from "@/components/ui";
import { Avatar, LiveMap } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  declinePriceAndReopen,
  getBooking,
  getBookingBarberPhone,
  getReviewForBooking,
  updateBookingStatus,
} from "@/lib/supabase/queries";
import { isRideDue } from "@/lib/booking-timing";
import type { BookingRecord, BookingStatus } from "@/lib/types";

function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COPY: Record<BookingStatus, { title: string; sub: string; badge: string; progress: number }> = {
  requested: { title: "Aanvraag verstuurd", sub: "Wachten op bevestiging van de barber", badge: "Aangevraagd", progress: 10 },
  price_pending: { title: "Prijs ontvangen", sub: "Bekijk en bevestig de prijs om verder te gaan", badge: "Bevestig prijs", progress: 20 },
  accepted: { title: "Barber bevestigd", sub: "Je barber komt eraan", badge: "Bevestigd", progress: 30 },
  en_route: { title: "Barber onderweg", sub: "Onderweg naar je adres", badge: "Onderweg", progress: 55 },
  arrived: { title: "Barber is aangekomen", sub: "Bij het opgegeven adres", badge: "Aangekomen", progress: 80 },
  in_progress: { title: "Knipbeurt bezig", sub: "Veel plezier!", badge: "Bezig", progress: 92 },
  completed: { title: "Knipbeurt afgerond", sub: "Bedankt voor het boeken", badge: "Afgerond", progress: 100 },
  cancelled: { title: "Aanvraag geannuleerd", sub: "Deze boeking is geannuleerd", badge: "Geannuleerd", progress: 0 },
};

const POLL_MS = 4000;

function StatusContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [barberName, setBarberName] = useState<string | null>(null);
  const [barberPhone, setBarberPhone] = useState<string | null>(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [confirmingPrice, setConfirmingPrice] = useState(false);
  const [decliningPrice, setDecliningPrice] = useState(false);
  const [declineDlg, setDeclineDlg] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    const supabase = createClient();

    async function refresh() {
      // Stil negeren bij een mislukte tick (bv. even geen netwerk) —
      // de volgende poll probeert het gewoon opnieuw.
      try {
        const b = await getBooking(supabase, bookingId!);
        setBooking(b);
      } catch {
        // niets doen
      }
    }

    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [bookingId]);

  // Pas de barbernaam tonen zodra de barber de aanvraag heeft
  // geaccepteerd — bij 'requested' (ook bij een directe boeking naar één
  // specifieke barber) is er nog geen bevestiging, dus nog niets om te
  // tonen. Los van de pollende booking-fetch hierboven zodat dit ook
  // meteen reageert zodra een latere poll-tick de status ziet omslaan.
  useEffect(() => {
    if (!booking?.barberId || booking.status === "requested" || barberName) return;
    const supabase = createClient();
    // Stil negeren bij een mislukte fetch (bv. even geen netwerk) — een
    // volgende poll-tick verandert booking.status en triggert dit opnieuw.
    (async () => {
      try {
        const { data } = await supabase.from("approved_barbers").select("full_name").eq("id", booking.barberId).single();
        if (data) setBarberName(data.full_name);
        setBarberPhone(await getBookingBarberPhone(supabase, booking.id));
      } catch {
        // niets doen
      }
    })();
  }, [booking?.barberId, booking?.status, booking?.id, barberName]);

  useEffect(() => {
    if (!bookingId || booking?.status !== "completed" || alreadyReviewed) return;
    const supabase = createClient();
    getReviewForBooking(supabase, bookingId).then((r) => setAlreadyReviewed(!!r));
  }, [bookingId, booking?.status, alreadyReviewed]);

  // Klant bevestigt de door een barber voorgestelde prijs (0042) — zet
  // status naar accepted, normale "ga naar betalen"-pad hierna.
  async function handleConfirmPrice() {
    if (!bookingId) return;
    setConfirmingPrice(true);
    setActionError(null);
    const supabase = createClient();
    const ok = await updateBookingStatus(supabase, bookingId, "accepted");
    setConfirmingPrice(false);
    if (!ok) {
      setActionError("Dit is niet gelukt — mogelijk is de 30 minuten al verstreken. Vernieuw de pagina.");
      return;
    }
    router.push(`/klant/betaling?bookingId=${bookingId}`);
  }

  // Klant weigert de prijs — aanvraag valt terug naar 'requested' en
  // wordt weer zichtbaar voor een andere barber (zelfde reset als een
  // timeout, zie expire-price-pending-requests).
  async function handleDeclinePrice() {
    if (!bookingId) return;
    setDecliningPrice(true);
    setActionError(null);
    const supabase = createClient();
    const ok = await declinePriceAndReopen(supabase, bookingId);
    setDecliningPrice(false);
    setDeclineDlg(false);
    if (!ok) {
      setActionError("Dit is niet gelukt. Probeer het opnieuw.");
    }
  }

  if (!bookingId) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-7 text-center text-text-secondary">
        Geen actieve boeking gevonden.
        <Button full className="mt-4" onClick={() => router.push("/klant/home")}>Naar home</Button>
      </div>
    );
  }

  // Een geaccepteerde, geplande (niet-asap) boeking die nog niet due is
  // (buiten het 2-uur-venster, zie isRideDue) is bevestigd maar de barber
  // is nog niet "onderweg" — daarvoor gewoon de gewone STATUS_COPY tonen
  // zou ten onrechte "komt eraan" + een live kaart suggereren voor een
  // afspraak die pas volgende week is.
  const rideDue = booking ? isRideDue(booking) : true;
  const scheduledLabel = booking?.scheduledAt ? `Gepland voor ${formatScheduledAt(booking.scheduledAt)}` : null;
  // Geaccepteerde, geplande boeking zonder betaling (0040) — de klant
  // moet hier eerst betalen vóór de gewone "afspraak bevestigd"/live-
  // kaart-weergave zin heeft.
  const paymentPending = booking?.status === "accepted" && !!booking.paymentDueAt;
  const priceConfirmPending = booking?.status === "price_pending";
  const minutesLeftToConfirm =
    priceConfirmPending && booking?.priceConfirmDueAt
      ? Math.max(0, Math.ceil((new Date(booking.priceConfirmDueAt).getTime() - Date.now()) / (60 * 1000)))
      : null;
  // In minuten (niet uren) — sinds migratie 0048 kan dit ook een
  // 15-minuten-venster zijn (asap, prijs net bevestigd), niet meer
  // uitsluitend het 24-uurs-venster van een geplande boeking. Op hele
  // uren afronden zou "nog 1 uur" tonen voor een deadline die al over
  // 14 minuten verstrijkt.
  const minutesLeftToPay =
    paymentPending && booking?.paymentDueAt
      ? Math.max(0, Math.ceil((new Date(booking.paymentDueAt).getTime() - Date.now()) / (60 * 1000)))
      : null;
  const copy = !booking
    ? null
    : paymentPending
      ? {
          title: "Betaal je afspraak",
          sub:
            (scheduledLabel ? `${scheduledLabel} — ` : "") +
            (minutesLeftToPay !== null
              ? minutesLeftToPay >= 60
                ? `nog ${Math.ceil(minutesLeftToPay / 60)} uur om te betalen`
                : `nog ${minutesLeftToPay} minuten om te betalen`
              : "rond de betaling af"),
          badge: "Betalen",
          progress: 20,
        }
      : priceConfirmPending
        ? {
            ...STATUS_COPY.price_pending,
            sub: minutesLeftToConfirm !== null ? `Nog ${minutesLeftToConfirm} minuten om te bevestigen` : STATUS_COPY.price_pending.sub,
          }
        : booking.status === "accepted" && !rideDue
        ? { ...STATUS_COPY.accepted, title: "Afspraak bevestigd", sub: scheduledLabel ?? STATUS_COPY.accepted.sub, badge: "Gepland" }
        : // Nog niet bevestigd door de barber, maar wel al een gekozen datum/
          // tijd — anders zag de klant hier alleen "Wachten op bevestiging"
          // zonder terug te zien wát 'ie eigenlijk had ingepland.
          booking.status === "requested" && !booking.requestedAsap && scheduledLabel
          ? { ...STATUS_COPY.requested, sub: scheduledLabel }
          : STATUS_COPY[booking.status];
  const canCancel = booking && ["requested", "price_pending", "accepted", "en_route"].includes(booking.status);
  const isCompleted = booking?.status === "completed";
  const canDispute =
    isCompleted &&
    !!booking?.completedAt &&
    Date.now() - new Date(booking.completedAt).getTime() < 24 * 60 * 60 * 1000;
  // Live kaart heeft alleen zin zolang de barber onderweg is — daarvoor
  // (nog geen bevestiging, of een geplande afspraak die nog niet due is)
  // of daarna (al ter plaatse) voegt 'm niets toe.
  const showLiveMap = (booking?.status === "accepted" || booking?.status === "en_route") && rideDue && !paymentPending;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 bg-[#F1F3F4] relative">
        <NavBar transparent onBack={() => router.push("/klant/home")} />
        {showLiveMap ? (
          <LiveMap
            barberLat={booking?.barberLiveLat ?? null}
            barberLng={booking?.barberLiveLng ?? null}
            destinationLat={booking?.lat ?? null}
            destinationLng={booking?.lng ?? null}
            barberLocationUpdatedAt={booking?.barberLocationUpdatedAt ?? null}
            placeholderLabel="Live kaart"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#C6CBD1] flex-col gap-2">
            <MapPin size={40} />
            <span className="text-[13px] font-medium">Live kaart</span>
          </div>
        )}
      </div>
      <div className="bg-white rounded-t-xl -mt-6 px-5 pt-5 pb-2 relative">
        <div className="w-9 h-1 rounded-full bg-border mx-auto mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[22px] font-bold tracking-[-0.01em]">{copy?.title ?? "Laden…"}</div>
            <div className="text-[15px] text-text-secondary mt-0.5">{copy?.sub}</div>
          </div>
          {copy && <Badge variant={booking?.status === "cancelled" ? "error" : "accent"}>{copy.badge}</Badge>}
        </div>
        <div className="h-1 rounded-full bg-border-soft mt-4 overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${copy?.progress ?? 0}%` }} />
        </div>
        <div className="flex gap-3.5 items-center mt-5 pt-4 border-t border-border-soft">
          <Avatar name={barberName ?? "?"} size={48} />
          <div className="flex-1">
            <div className="text-[16px] font-semibold">{barberName ?? "Barber"}</div>
            <div className="text-[13px] text-text-secondary">
              {booking?.serviceName}
              {booking?.priceCents != null ? ` · €${(booking.priceCents / 100).toFixed(2).replace(".", ",")}` : " · Prijs volgt"}
            </div>
          </div>
          <div className="flex gap-2">
            <IconButton
              label="Bericht"
              disabled={!barberPhone}
              onClick={() => barberPhone && (window.location.href = `sms:${barberPhone}`)}
            >
              <MessageCircle size={18} />
            </IconButton>
            <IconButton
              label="Bel"
              variant="primary"
              disabled={!barberPhone}
              onClick={() => barberPhone && (window.location.href = `tel:${barberPhone}`)}
            >
              <Phone size={18} />
            </IconButton>
          </div>
        </div>
        <div className="mt-4 mb-2 flex flex-col gap-2">
          {paymentPending && (
            <Button full size="md" variant="accent" onClick={() => router.push(`/klant/betaling?bookingId=${bookingId}`)}>
              Betaal nu
            </Button>
          )}
          {priceConfirmPending && (
            <>
              <Button full size="md" variant="accent" disabled={confirmingPrice} onClick={handleConfirmPrice}>
                {confirmingPrice ? "Bezig…" : "Akkoord, ga naar betalen"}
              </Button>
              <Button full size="md" variant="secondary" onClick={() => setDeclineDlg(true)}>
                Weiger, zoek een andere barber
              </Button>
            </>
          )}
          {actionError && (
            <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">{actionError}</div>
          )}
          {isCompleted && !alreadyReviewed && (
            <Button full size="md" variant="accent" onClick={() => router.push(`/klant/review?bookingId=${bookingId}`)}>
              Laat een review achter
            </Button>
          )}
          {canDispute && (
            <Button full size="md" variant="ghost" onClick={() => router.push(`/klant/geschil?bookingId=${bookingId}`)}>
              Probleem melden
            </Button>
          )}
          {canCancel && (
            <Button full size="md" variant="secondary" onClick={() => router.push(`/klant/annuleren?bookingId=${bookingId}`)}>
              Annuleer aanvraag
            </Button>
          )}
          {booking?.status === "cancelled" && (
            <Button full size="md" variant="secondary" onClick={() => router.push("/klant/home")}>
              Naar home
            </Button>
          )}
        </div>
      </div>
      <Dialog
        open={declineDlg}
        title="Prijs weigeren?"
        onClose={() => setDeclineDlg(false)}
        actions={
          <>
            <Button full size="md" disabled={decliningPrice} onClick={handleDeclinePrice}>
              {decliningPrice ? "Bezig…" : "Ja, zoek een andere barber"}
            </Button>
            <Button full size="md" variant="ghost" onClick={() => setDeclineDlg(false)}>Terug</Button>
          </>
        }
      >
        Je aanvraag staat dan weer open voor andere barbers binnen de resterende geldigheid. Er is nog niets in
        rekening gebracht.
      </Dialog>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense>
      <StatusContent />
    </Suspense>
  );
}
