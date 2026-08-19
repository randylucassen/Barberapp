"use client";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/ui";
import { EmptyState } from "./EmptyState";
import { Row } from "./Row";
import { createClient } from "@/lib/supabase/client";
import { getNotificationsForUser, markNotificationRead } from "@/lib/supabase/queries";
import type { AppNotification } from "@/lib/types";

// Waar een tik op een melding naartoe moet — per rol, want dezelfde
// notification_type betekent een ander scherm voor klant vs. barber.
// null = geen zinnig doel (geen booking-context, of geen scherm dat daar
// iets mee kan) — die rijen blijven gewoon niet-klikbaar, zoals voorheen.
function getHref(n: AppNotification, role: "klant" | "barber"): string | null {
  const bookingId = n.relatedBookingId;
  if (role === "klant") {
    switch (n.type) {
      case "review_reminder":
        return bookingId ? `/klant/review?bookingId=${bookingId}` : null;
      case "accepted":
      case "en_route":
      case "arrived":
      case "completed":
      case "cancelled":
      case "dispute":
        return bookingId ? `/klant/status?bookingId=${bookingId}` : null;
      case "wallet_topup":
      case "referral_bonus":
        return "/klant/wallet";
      default:
        return null;
    }
  }
  switch (n.type) {
    case "new_request":
      return "/barber/aanvraag";
    case "payment_received":
      return "/barber/verdiensten";
    case "review_received":
      return "/barber/reviews";
    case "wallet_topup":
      return "/barber/wallet";
    case "completed":
    case "cancelled":
    case "booking_reminder":
      return "/barber/dashboard";
    case "invoice_available":
      return "/barber/facturen";
    case "invoice_address_missing":
      return "/barber/aanmelden";
    default:
      return null;
  }
}

function NotifDot({ accent }: { accent: boolean }) {
  return (
    <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${accent ? "bg-accent-soft text-accent" : "bg-surface text-text-tertiary"}`}>
      <Bell size={18} />
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.round(hours / 24);
  return `${days} d geleden`;
}

// Gedeeld tussen /klant/notificaties en /barber/notificaties (Fase 8) —
// beide rollen gebruiken dezelfde generieke getNotificationsForUser(),
// de terugknop-bestemming én de per-rij tik-bestemming (getHref
// hierboven) verschillen per rol.
export function NotificationsList({ onBack, role }: { onBack: () => void; role: "klant" | "barber" }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const list = await getNotificationsForUser(supabase, data.user.id);
      setNotifications(list);
      setLoading(false);

      const unread = list.filter((n) => !n.read);
      await Promise.all(unread.map((n) => markNotificationRead(supabase, n.id)));
    })();
  }, []);

  const empty = !loading && notifications.length === 0;

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Meldingen" onBack={onBack} />
      {empty ? (
        <EmptyState icon={<Bell size={28} />} title="Nog geen meldingen" sub="Hier zie je updates over je boekingen." />
      ) : (
        <div className="px-5 pt-2 flex-1 overflow-y-auto no-scrollbar">
          {notifications.map((n) => {
            const href = getHref(n, role);
            return (
              <Row
                key={n.id}
                left={<NotifDot accent={!n.read} />}
                title={n.title}
                sub={n.body ? `${n.body} · ${timeAgo(n.createdAt)}` : timeAgo(n.createdAt)}
                onClick={href ? () => router.push(href) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
