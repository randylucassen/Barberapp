"use client";
import { Calendar, TrendingUp, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";
import { PhoneShell } from "@/components/shared";
import { TabBar, TabItem } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { updateBarberLastActive } from "@/lib/supabase/queries";

// Heartbeat-interval ruim onder de 90s-staleness-drempel in
// barber_is_online_and_available() (0037) — zolang een barber-scherm
// open is met een geldige sessie blijft last_active_at vers. Zonder dit
// bleef een uitgelogde of gewoon-dichtgeklikte barber voor de klant
// "online" staan totdat die zelf de schakelaar omzette.
const HEARTBEAT_MS = 20_000;

const TABS: TabItem[] = [
  { key: "vandaag", label: "Vandaag", icon: <Calendar size={22} />, href: "/barber/dashboard" },
  { key: "verdiensten", label: "Verdiensten", icon: <TrendingUp size={22} />, href: "/barber/verdiensten" },
  { key: "profiel", label: "Profiel", icon: <User size={22} />, href: "/barber/profiel" },
];

const TAB_VISIBLE_PATHS = ["/barber/dashboard", "/barber/verdiensten", "/barber/profiel"];

export default function BarberLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const showTabs = TAB_VISIBLE_PATHS.includes(pathname);

  useEffect(() => {
    const supabase = createClient();
    let interval: ReturnType<typeof setInterval> | undefined;

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      updateBarberLastActive(supabase, data.user.id);
      interval = setInterval(() => updateBarberLastActive(supabase, data.user.id), HEARTBEAT_MS);
    });

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);
  const activeTab = pathname.startsWith("/barber/verdiensten")
    ? "verdiensten"
    : pathname.startsWith("/barber/profiel")
      ? "profiel"
      : "vandaag";

  return (
    <PhoneShell>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col">{children}</div>
      {showTabs && (
        <TabBar items={TABS} value={activeTab} onChange={(key) => router.push(TABS.find((t) => t.key === key)!.href)} />
      )}
    </PhoneShell>
  );
}
