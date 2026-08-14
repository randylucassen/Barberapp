"use client";
import { ReactNode, useEffect, useState } from "react";

/**
 * De iOS-viewport (390x844) uit de designs, gecentreerd op het scherm.
 * Elke schermroute rendert binnen deze shell.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  // De CSS `dvh`-eenheid bleek op sommige echte mobiele browsers (vooral
  // in-app-webviews, bv. een link geopend vanuit de Notities-app) een
  // andere waarde te berekenen dan de daadwerkelijk zichtbare hoogte —
  // gaf een grijze rand boven/onder. Reproduceerde niet in een simulator
  // (daar klopte `dvh` altijd exact), dus puur CSS is niet betrouwbaar
  // genoeg hier. `window.innerHeight` is de waarde die de browser zelf
  // gebruikt voor waar de content daadwerkelijk past, en verandert
  // bewust niet zodra het toetsenbord opent (in tegenstelling tot
  // `visualViewport.height`) — dat willen we ook niet, anders krimpt de
  // hele phone-shell zodra je een tekstveld aantikt.
  const [heightPx, setHeightPx] = useState<number | null>(null);

  useEffect(() => {
    function updateHeight() {
      setHeightPx(window.innerHeight);
    }
    updateHeight();
    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);
    return () => {
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
    };
  }, []);

  return (
    <div
      className="h-dvh w-full flex items-center justify-center bg-[#EDEFF1] sm:py-6"
      style={heightPx !== null ? { height: heightPx } : undefined}
    >
      <div className="w-full max-w-phone h-full sm:h-[844px] sm:max-h-phone bg-white sm:rounded-[36px] sm:shadow-[0_0_0_10px_#111111,0_20px_60px_rgba(0,0,0,.25)] overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
