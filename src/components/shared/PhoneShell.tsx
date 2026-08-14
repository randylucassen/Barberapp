import { ReactNode } from "react";

/**
 * De iOS-viewport (390x844) uit de designs, gecentreerd op het scherm.
 * Elke schermroute rendert binnen deze shell.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    // h-dvh (niet alleen min-h-dvh) op de buitenste div: dat maakt 'm de
    // enige plek die de dynamic-viewport-height opvraagt. De binnenste
    // div gebruikt daarna gewoon h-full i.p.v. zelf ook h-dvh te vragen —
    // twee losse dvh-berekeningen kunnen op sommige mobiele browsers
    // (vooral in-app-webviews, bv. vanuit de Notities-app geopend) een
    // paar pixels uit elkaar liggen, wat een grijze rand boven/onder gaf
    // omdat items-center de "overgebleven" ruimte dan zichtbaar verdeelt.
    <div className="h-dvh w-full flex items-center justify-center bg-[#EDEFF1] sm:py-6">
      <div className="w-full max-w-phone h-full sm:h-[844px] sm:max-h-phone bg-white sm:rounded-[36px] sm:shadow-[0_0_0_10px_#111111,0_20px_60px_rgba(0,0,0,.25)] overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
