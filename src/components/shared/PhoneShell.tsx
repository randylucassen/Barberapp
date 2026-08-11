import { ReactNode } from "react";

/**
 * De iOS-viewport (390x844) uit de designs, gecentreerd op het scherm.
 * Elke schermroute rendert binnen deze shell.
 */
export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-[#EDEFF1] sm:py-6">
      <div className="w-full max-w-phone h-dvh sm:h-[844px] sm:max-h-phone bg-white sm:rounded-[36px] sm:shadow-[0_0_0_10px_#111111,0_20px_60px_rgba(0,0,0,.25)] overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  );
}
