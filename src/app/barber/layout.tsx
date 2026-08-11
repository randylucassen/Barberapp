"use client";
import { Calendar, TrendingUp, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { PhoneShell } from "@/components/shared";
import { TabBar, TabItem } from "@/components/ui";

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
