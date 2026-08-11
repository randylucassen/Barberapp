"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { AdminUserRow } from "@/lib/supabase/queries";

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleSuspend(customerId: string, suspended: boolean) {
    setBusyId(customerId);
    setError(null);
    const res = await fetch("/api/admin/customers/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, suspended }),
    });
    setBusyId(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error || "Actie is mislukt. Probeer het opnieuw.");
      return;
    }
    router.refresh();
  }

  if (users.length === 0) {
    return <div className="text-[14px] text-text-secondary">Geen gebruikers gevonden.</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px] mb-1">
          {error}
        </div>
      )}
      {users.map((u) => (
        <div key={u.id} className="bg-white border border-border rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold">{u.fullName}</span>
              <Badge variant={u.role === "barber" ? "accent" : "neutral"}>{u.role}</Badge>
              {u.suspended && <Badge variant="error">geschorst</Badge>}
              {u.role === "barber" && u.barberStatus && <Badge variant="neutral">{u.barberStatus}</Badge>}
            </div>
            <div className="text-[13px] text-text-secondary mt-0.5">{u.email}</div>
          </div>
          {u.role === "customer" ? (
            <Button size="sm" variant={u.suspended ? "secondary" : "ghost"} disabled={busyId === u.id} onClick={() => toggleSuspend(u.id, !u.suspended)}>
              {u.suspended ? "Herstellen" : "Schorsen"}
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => router.push("/admin/barbers")}>
              Naar barberbeheer
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
