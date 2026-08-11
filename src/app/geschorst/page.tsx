"use client";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui";
import { EmptyState, PhoneShell } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";

// Gedeeld tussen klant en barber (Fase 10) — middleware.ts stuurt hier
// naartoe zodra profiles.suspended of barber_status = 'suspended' is.
// Puur informatief, geen queries nodig: als je hier komt, weet je al
// dat je geschorst bent.
export default function SuspendedPage() {
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <PhoneShell>
      <div className="flex flex-col h-full">
        <EmptyState
          icon={<ShieldOff size={28} />}
          title="Je account is geschorst"
          sub="Neem contact op met Groomy als je denkt dat dit niet klopt."
          action={
            <Button size="md" onClick={handleLogout}>
              Uitloggen
            </Button>
          }
        />
      </div>
    </PhoneShell>
  );
}
