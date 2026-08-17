"use client";
import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getPayment } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import type { PaymentRecord } from "@/lib/types";

// Zelfde tekst als de terugbetaling-notificaties in
// /api/stripe/cancel-and-refund — Stripe stort een refund altijd terug op
// de oorspronkelijke betaalmethode (iDEAL -> bank, kaart -> kaart), nooit
// naar een andere rekening of als wallet-tegoed.
const REFUND_TIMING_NOTE =
  "Dit gaat naar je oorspronkelijke betaalmethode (bank bij iDEAL, kaart bij een kaartbetaling) en is meestal binnen 5-10 werkdagen zichtbaar.";

// Voorheen altijd het statische "Er is nog geen betaling in rekening
// gebracht" — dat is sinds de annuleringskosten-feature niet meer
// waar zodra een late annulering écht geld kostte. Haalt nu de
// betaling op en toont het daadwerkelijke bedrag.
function CancelledContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [payment, setPayment] = useState<PaymentRecord | null | undefined>(undefined);

  useEffect(() => {
    if (!bookingId) {
      setPayment(null);
      return;
    }
    getPayment(createClient(), bookingId).then(setPayment);
  }, [bookingId]);

  // escrow_state 'released' betekent hier: een deel is ingehouden als
  // annuleringskosten (zie /api/stripe/cancel-and-refund) — 'refunded'
  // betekent een volledige terugbetaling, geen payments-rij betekent dat
  // er nooit betaald is (kan niet in de normale flow, maar dan simpelweg
  // niets te melden over een refund).
  const feeCharged = payment?.escrowState === "released";
  const fullyRefunded = payment?.escrowState === "refunded";

  return (
    <div className="flex flex-col h-full items-center justify-center px-7 text-center">
      <div className="w-[88px] h-[88px] rounded-full bg-surface text-text-secondary flex items-center justify-center">
        <X size={36} />
      </div>
      <div className="text-[26px] font-bold tracking-[-0.02em] mt-6">Boeking geannuleerd</div>
      <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
        {payment === undefined
          ? "Je aanvraag is geannuleerd."
          : feeCharged
            ? `Je aanvraag is geannuleerd. Omdat dit vlak voor de afspraak was, is €${euro(payment!.amountCents)} in rekening gebracht als compensatie voor je barber. De rest is terugbetaald. ${REFUND_TIMING_NOTE}`
            : fullyRefunded
              ? `Je aanvraag is geannuleerd. Je hebt €${euro(payment!.amountCents)} volledig terugbetaald gekregen. ${REFUND_TIMING_NOTE}`
              : "Je aanvraag is geannuleerd. Er is geen betaling in rekening gebracht."}
      </div>
      <div className="mt-8 w-full">
        <Button full onClick={() => router.push("/klant/home")}>Naar home</Button>
      </div>
    </div>
  );
}

export default function CancelledPage() {
  return (
    <Suspense>
      <CancelledContent />
    </Suspense>
  );
}
