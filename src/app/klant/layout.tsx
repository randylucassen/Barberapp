"use client";
import { Home, Calendar, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { PhoneShell } from "@/components/shared";
import { TabBar, TabItem } from "@/components/ui";

const TABS: TabItem[] = [
  { key: "home", label: "Home", icon: <Home size={22} />, href: "/klant/home" },
  { key: "boekingen", label: "Boekingen", icon: <Calendar size={22} />, href: "/klant/barbers" },
  { key: "profiel", label: "Profiel", icon: <User size={22} />, href: "/klant/profiel" },
];

// Tab bar alleen op de "root" schermen van elke tab — net als in de
// designs, waar detail- en flowschermen de tab bar verbergen.
const TAB_VISIBLE_PATHS = ["/klant/home", "/klant/profiel"];

export default function KlantLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const showTabs = TAB_VISIBLE_PATHS.includes(pathname);
  const activeTab = pathname.startsWith("/klant/profiel") ? "profiel" : "home";

  return (
    <PhoneShell>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col">{children}</div>
      {showTabs && (
        <TabBar items={TABS} value={activeTab} onChange={(key) => router.push(TABS.find((t) => t.key === key)!.href)} />
      )}
    </PhoneShell>
  );
}
