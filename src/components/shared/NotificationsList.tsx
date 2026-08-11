"use client";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/ui";
import { EmptyState } from "./EmptyState";
import { Row } from "./Row";
import { createClient } from "@/lib/supabase/client";
import { getNotificationsForUser, markNotificationRead } from "@/lib/supabase/queries";
import type { AppNotification } from "@/lib/types";

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
// alleen de terugknop-bestemming verschilt.
export function NotificationsList({ onBack }: { onBack: () => void }) {
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
          {notifications.map((n) => (
            <Row
              key={n.id}
              left={<NotifDot accent={!n.read} />}
              title={n.title}
              sub={n.body ? `${n.body} · ${timeAgo(n.createdAt)}` : timeAgo(n.createdAt)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
