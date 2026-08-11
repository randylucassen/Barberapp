"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui";

export default function ErrorBoundary({
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
    <div className="min-h-dvh flex flex-col items-center justify-center px-7 text-center bg-white">
      <div className="w-16 h-16 rounded-full bg-surface text-text-tertiary flex items-center justify-center">
        <AlertTriangle size={28} />
      </div>
      <div className="text-[18px] font-semibold tracking-[-0.01em] mt-4">
        Er ging iets mis
      </div>
      <div className="text-[14px] text-text-secondary mt-1.5 leading-5 max-w-xs">
        Deze pagina kon niet geladen worden. Probeer het opnieuw — als het
        blijft gebeuren, neem dan contact op.
      </div>
      <div className="mt-5">
        <Button size="md" onClick={reset}>
          Probeer opnieuw
        </Button>
      </div>
    </div>
  );
}
