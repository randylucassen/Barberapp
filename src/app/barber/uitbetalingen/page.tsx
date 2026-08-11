"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, NavBar } from "@/components/ui";
import { EscrowDot, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBarberProfile, getPaymentsForBarber, type BarberPaymentRow } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import type { EscrowState } from "@/lib/types";

const BADGE_LABEL: Record<EscrowState, string> = {
  held: "Vast",
  releasing: "Wordt vrijgegeven",
  released: "Vrijgegeven",
  paid: "Uitbetaald",
  refunded: "Terugbetaald",
};

const BADGE_VARIANT: Record<EscrowState, "neutral" | "accent" | "success" | "error"> = {
  held: "neutral",
  releasing: "neutral",
  released: "accent",
  paid: "success",
  refunded: "error",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export default function PayoutsPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<BarberPaymentRow[]>([]);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const [profile, rows] = await Promise.all([
        getBarberProfile(supabase, data.user.id),
        getPaymentsForBarber(supabase, data.user.id),
      ]);
      setPayoutsEnabled(profile?.stripePayoutsEnabled ?? false);
      setPayments(rows);
      setLoading(false);
    });
  }, []);

  async function handleConnect() {
    setConnecting(true);
    const res = await fetch("/api/stripe/connect-onboarding", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      setConnecting(false);
    }
  }

  const heldTotal = payments
    .filter((p) => p.escrowState === "held" || p.escrowState === "releasing")
    .reduce((sum, p) => sum + p.barberPayoutCents, 0);
  const releasedTotal = payments
    .filter((p) => p.escrowState === "released" || p.escrowState === "paid")
    .reduce((sum, p) => sum + p.barberPayoutCents, 0);

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Uitbetalingen" onBack={() => router.push("/barber/verdiensten")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {!loading && !payoutsEnabled && (
          <Card variant="inverse" padding={20}>
            <div className="text-[15px] font-semibold">Koppel je Stripe-account</div>
            <div className="text-[13px] text-white/60 mt-1 leading-[19px]">
              Nodig om uitbetaald te worden. Duurt een paar minuten, Stripe host je hele
              verificatie en bankgegevens.
            </div>
            <Button full className="mt-4" variant="accent" disabled={connecting} onClick={handleConnect}>
              {connecting ? "Bezig…" : "Koppelen"}
            </Button>
          </Card>
        )}
        {!loading && payoutsEnabled && (
          <Card variant="inverse" padding={20}>
            <div className="text-[13px] text-white/60">Vrijgegeven, wacht op Stripe-uitbetaling</div>
            <div className="text-[30px] font-bold tracking-[-0.02em] mt-1">€{euro(releasedTotal)}</div>
            <div className="text-[13px] text-accent mt-1">Stripe gekoppeld · wekelijkse uitbetaling</div>
          </Card>
        )}
        <div className="mt-5 text-[17px] font-semibold tracking-[-0.01em]">In escrow · €{euro(heldTotal)}</div>
        <div className="text-[13px] text-text-secondary mt-0.5 leading-[19px]">
          Betalingen van klanten staan vast tot 24 uur na de boeking, daarna automatisch vrijgegeven.
        </div>
        <div className="mt-2">
          {!loading && payments.length === 0 && (
            <div className="text-[14px] text-text-secondary py-4">Nog geen betalingen.</div>
          )}
          {payments.map((p) => (
            <Row
              key={p.paymentId}
              left={<EscrowDot state={p.escrowState} />}
              title={p.serviceName}
              sub={`${formatDate(p.createdAt)} · €${euro(p.barberPayoutCents)}`}
              right={<Badge variant={BADGE_VARIANT[p.escrowState]}>{BADGE_LABEL[p.escrowState]}</Badge>}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
