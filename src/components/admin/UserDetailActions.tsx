"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

// Zelfde schorsen/herstellen-actie als UsersTable op /admin/gebruikers,
// hier herhaald op de detailpagina zodat een admin niet terug hoeft naar
// de lijst om dezelfde knop te vinden — bewust alleen voor klanten, net
// als op de lijst (barbers gaan via /admin/barbers se eigen statusflow).
export function UserDetailActions({ customerId, suspended }: { customerId: string; suspended: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleSuspend() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/customers/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, suspended: !suspended }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Actie is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button size="sm" variant={suspended ? "secondary" : "ghost"} disabled={busy} onClick={toggleSuspend}>
        {suspended ? "Herstellen" : "Schorsen"}
      </Button>
      {error && <div className="text-[12px] text-error-text max-w-[200px] text-right">{error}</div>}
    </div>
  );
}
