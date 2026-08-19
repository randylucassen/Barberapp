"use client";
import { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/admin", label: "Statistieken" },
  { href: "/admin/barbers", label: "Barbers" },
  { href: "/admin/geschillen", label: "Geschillen" },
  { href: "/admin/boekingen", label: "Vastgelopen boekingen" },
  { href: "/admin/no-shows", label: "Gemiste afspraken" },
  { href: "/admin/betalingen", label: "Betalingen" },
  { href: "/admin/facturen", label: "Facturen" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/kortingscodes", label: "Kortingscodes" },
  { href: "/admin/gebruikers", label: "Gebruikers" },
  { href: "/admin/logboek", label: "Logboek" },
];

// Gedeelde desktop-navigatie voor alle ingelogde admin-schermen (niet
// gebruikt op /admin/login, waar navigeren nog geen zin heeft).
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex">
      <aside className="w-56 flex-shrink-0 bg-primary text-white flex flex-col">
        <div className="px-5 py-5 text-[17px] font-bold tracking-[-0.01em]">Groomy Admin</div>
        <nav className="flex-1 px-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <div
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`px-3 py-2.5 rounded-md text-[14px] font-medium cursor-pointer mb-0.5 ${
                  active ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </div>
            );
          })}
        </nav>
        <div className="p-3">
          <Button full variant="secondary" size="sm" onClick={handleLogout}>
            Uitloggen
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-8 py-6 overflow-y-auto">{children}</main>
    </div>
  );
}
