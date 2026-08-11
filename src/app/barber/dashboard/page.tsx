"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Switch } from "@/components/ui";
import { Avatar, NotificationBell, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  getBarberProfile,
  getBookingCustomerName,
  getOpenBroadcastRequestForBarber,
  getPaymentsForBarber,
  getPendingRequestForBarber,
  getRecentBookingsForBarber,
  hasUnreadNotifications,
  setBarberOnline,
} from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import type { BookingRecord, BookingStatus } from "@/lib/types";

const STATUS_BADGE: Record<BookingStatus, { label: string; variant: "success" | "accent" | "neutral" | "error" }> = {
  requested: { label: "Nieuw", variant: "accent" },
  accepted: { label: "Bevestigd", variant: "success" },
  en_route: { label: "Onderweg", variant: "accent" },
  arrived: { label: "Aangekomen", variant: "accent" },
  in_progress: { label: "Bezig", variant: "accent" },
  completed: { label: "Afgerond", variant: "neutral" },
  cancelled: { label: "Geannuleerd", variant: "error" },
};

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 bg-surface rounded-md px-4 py-3.5">
      <div className={`text-[20px] font-bold tracking-[-0.01em] ${accent ? "text-accent" : "text-primary"}`}>{value}</div>
      <div className="text-[12px] text-text-secondary mt-0.5">{label}</div>
    </div>
  );
}

export default function BarberDashboardPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [onlineError, setOnlineError] = useState(false);
  const [hasRequest, setHasRequest] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [bookings, setBookings] = useState<(BookingRecord & { customerName: string })[]>([]);
  const [ratingAvg, setRatingAvg] = useState<number | null>(null);
  const [todayCents, setTodayCents] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const barberId = data.user.id;
      setUserId(barberId);

      const profile = await getBarberProfile(supabase, barberId);
      setOnline(profile?.isOnline ?? false);
      setRatingAvg(profile?.ratingAvg ?? null);

      const recent = await getRecentBookingsForBarber(supabase, barberId);
      const withNames = await Promise.all(
        recent.map(async (b) => ({
          ...b,
          customerName: (await getBookingCustomerName(supabase, b.id)) ?? "Klant",
        }))
      );
      setBookings(withNames);

      const payments = await getPaymentsForBarber(supabase, barberId);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const earnedToday = payments
        .filter((p) => p.escrowState !== "refunded" && new Date(p.createdAt) >= todayStart)
        .reduce((sum, p) => sum + p.barberPayoutCents, 0);
      setTodayCents(earnedToday);
    })();
  }, []);

  // Zonder polling zou een barber die al op het dashboard staat een
  // nieuwe aanvraag nooit zien verschijnen — de check liep voorheen maar
  // één keer, bij het laden van de pagina (in tegenstelling tot
  // /klant/status, dat ditzelfde pollingpatroon al gebruikte).
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    async function checkForRequests() {
      // Een mislukte tick (bv. even geen netwerk) mag de polling niet
      // stukgooien — anders crasht een tijdelijke hobbel de hele pagina
      // i.p.v. dat de volgende tick het gewoon opnieuw probeert.
      try {
        const pending = await getPendingRequestForBarber(supabase, userId!);
        const broadcast = online ? await getOpenBroadcastRequestForBarber(supabase) : null;
        setHasRequest(!!pending || !!broadcast);
        setHasUnread(await hasUnreadNotifications(supabase, userId!));
      } catch {
        // stil negeren, volgende tick probeert opnieuw
      }
    }
    checkForRequests();
    const interval = setInterval(checkForRequests, 5000);
    return () => clearInterval(interval);
  }, [userId, online]);

  async function handleToggleOnline(next: boolean) {
    setOnline(next);
    setOnlineError(false);
    if (!userId) return;
    const supabase = createClient();
    const ok = await setBarberOnline(supabase, userId, next);
    if (!ok) {
      // Terugdraaien naar de echte, opgeslagen staat — anders denkt de
      // barber dat die online staat (en dus aanvragen krijgt) terwijl de
      // database nog steeds offline zegt.
      setOnline(!next);
      setOnlineError(true);
      return;
    }
    if (next) {
      const broadcast = await getOpenBroadcastRequestForBarber(supabase);
      setHasRequest((prev) => prev || !!broadcast);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4 flex items-center justify-between">
        <span className="font-bold text-[22px] tracking-[-0.03em]">
          Groomy <span className="text-accent">Barber</span>
        </span>
        <NotificationBell hasUnread={hasUnread} onClick={() => router.push("/barber/notificaties")} />
      </div>
      <div className="px-5 pt-5">
        <Card variant={online ? "inverse" : "outline"} padding={20}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[17px] font-semibold">{online ? "Je bent online" : "Je bent offline"}</div>
              <div className={`text-[13px] mt-0.5 ${online ? "text-white/60" : "text-text-secondary"}`}>
                {online ? "Aanvragen komen binnen" : "Zet aan om aanvragen te ontvangen"}
              </div>
            </div>
            <Switch checked={online} onChange={handleToggleOnline} />
          </div>
        </Card>
        {onlineError && (
          <div className="mt-2 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            Status wijzigen is niet gelukt. Probeer het opnieuw.
          </div>
        )}
      </div>
      <div className="px-5 pt-4 flex gap-2.5">
        <Stat label="Vandaag" value={`€${euro(todayCents)}`} accent />
        <Stat label="Boekingen" value={String(bookings.length)} />
        <Stat label="Rating" value={ratingAvg ? `${ratingAvg.toFixed(1).replace(".", ",")}` : "–"} />
      </div>
      <div className="px-5 pt-6 flex-1 overflow-y-auto no-scrollbar">
        <div className="text-[17px] font-semibold tracking-[-0.01em] mb-1">Vandaag</div>
        {bookings.length === 0 && (
          <div className="text-[14px] text-text-secondary py-4">Nog geen boekingen.</div>
        )}
        {bookings.map((b) => (
          <Row
            key={b.id}
            left={<Avatar name={b.customerName} />}
            title={b.customerName}
            sub={`${b.serviceName} · ${b.address}`}
            right={<Badge variant={STATUS_BADGE[b.status].variant}>{STATUS_BADGE[b.status].label}</Badge>}
          />
        ))}
      </div>
      {online && hasRequest && (
        <div className="px-5 pt-3 pb-2 border-t border-border">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-[15px] font-semibold">Nieuwe aanvraag</span>
          </div>
          <Button full variant="accent" onClick={() => router.push("/barber/aanvraag")}>Bekijk aanvraag</Button>
        </div>
      )}
    </div>
  );
}
