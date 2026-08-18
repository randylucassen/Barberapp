import { ReactNode } from "react";

// Zonder dit rendert Next.js elke admin-subpagina die geen searchParams/
// cookies leest (bv. no-shows, geschillen, logboek, kortingscodes,
// reviews, boekingen, het dashboard zelf) statisch bij de build — die
// pagina's toonden daardoor stilzwijgend voor altijd de databasestand van
// bouwmoment i.p.v. live data (gevonden 2026-08-18: /admin/no-shows bleef
// "geen gemiste afspraken" tonen nadat er allang echte rijen bijkwamen).
// `dynamic` op een layout cascadeert naar alle onderliggende pagina's, dus
// dit dekt ook nieuwe adminschermen die later worden toegevoegd.
export const dynamic = "force-dynamic";

// Bewust geen PhoneShell — het adminpanel is een intern,
// desktop-georiënteerd werktuig (tabellen, formulieren), geen mobiele
// klant-/barber-app. Normale, volle breedte i.p.v. het vaste
// 390px-telefoonframe dat klant/barber-layout.tsx gebruikt.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-surface font-sans text-text-primary">{children}</div>;
}
