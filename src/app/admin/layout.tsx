import { ReactNode } from "react";

// Bewust geen PhoneShell — het adminpanel is een intern,
// desktop-georiënteerd werktuig (tabellen, formulieren), geen mobiele
// klant-/barber-app. Normale, volle breedte i.p.v. het vaste
// 390px-telefoonframe dat klant/barber-layout.tsx gebruikt.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-surface font-sans text-text-primary">{children}</div>;
}
