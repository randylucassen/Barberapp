"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

// Vangnet voor fouten in de root layout zelf (error.tsx vangt dat niet,
// want dat rendert ín de layout) — moet daarom zelf <html>/<body> leveren.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="nl">
      <body className="font-sans">
        <div className="min-h-dvh flex flex-col items-center justify-center px-7 text-center bg-white">
          <div className="text-[18px] font-semibold tracking-[-0.01em]">
            Er ging iets mis
          </div>
          <div className="text-[14px] text-text-secondary mt-1.5 leading-5 max-w-xs">
            De app kon niet geladen worden. Probeer het opnieuw.
          </div>
          <button
            onClick={reset}
            className="mt-5 h-ctrl-lg px-6 rounded-full bg-primary text-white text-[17px]"
          >
            Probeer opnieuw
          </button>
        </div>
      </body>
    </html>
  );
}
