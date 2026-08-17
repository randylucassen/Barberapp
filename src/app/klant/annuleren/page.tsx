"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Input, NavBar, Radio } from "@/components/ui";
import { Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getBooking } from "@/lib/supabase/queries";
import { cancellationFeeApplies, CANCELLATION_FEE_PERCENTAGE } from "@/lib/booking-timing";
import { computePriceBreakdown, euro } from "@/lib/pricing";
import { CANCEL_REASONS } from "@/lib/mock-data";
import type { BookingRecord } from "@/lib/types";

function CancelContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    getBooking(createClient(), bookingId).then(setBooking);
  }, [bookingId]);

  const isOther = reason === "Overig";
  const canSubmit = reason !== null && (!isOther || customReason.trim().length > 0);
  // Vóór het laden van de boeking bewust nog geen kosten-waarschuwing
  // tonen — beter even niets zeggen dan ten onrechte "gratis" beloven.
  const feeApplies = booking ? cancellationFeeApplies(booking) : null;
  // De servicekosten (feeCents) blijven bij een late annulering altijd
  // volledig staan — de 50%-regel geldt alleen op het dienstbedrag zelf
  // (priceCents), zelfde model als /api/stripe/cancel-and-refund.
  const { priceCents, totalCents } = booking ? computePriceBreakdown(booking.priceCents) : { priceCents: 0, totalCents: 0 };
  const refundCents = Math.round((priceCents * CANCELLATION_FEE_PERCENTAGE) / 100);
  const keptCents = totalCents - refundCents;

  async function handleCancel() {
    if (!bookingId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const cancelledReason = isOther ? `Overig: ${customReason.trim()}` : reason!;
    const res = await fetch("/api/stripe/cancel-and-refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, cancelledReason }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Annuleren is niet gelukt — mogelijk is de status al gewijzigd. Probeer het opnieuw.");
      return;
    }
    router.push(`/klant/geannuleerd?bookingId=${bookingId}`);
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Annuleren" onBack={() => router.back()} />
      <div className="px-5 pt-4 flex-1">
        <div className="text-[22px] font-bold tracking-[-0.01em]">Waarom annuleer je?</div>
        {feeApplies !== null && (
          <div className="mt-2 bg-error-soft rounded-md px-4 py-3 text-[13px] text-error-text leading-[19px]">
            {feeApplies
              ? `Je annuleert vlak voor de afspraak (of terwijl je barber al onderweg is) — je krijgt €${euro(
                  refundCents
                )} terug, €${euro(keptCents)} (incl. servicekosten) blijft staan als compensatie voor je barber. Je barber ontvangt direct bericht van de annulering.`
              : "Annuleren is nu nog gratis. Je barber ontvangt direct bericht van de annulering."}
          </div>
        )}
        {error && (
          <div className="mt-2 bg-error-soft rounded-md px-4 py-3 text-[13px] text-error-text leading-[19px]">
            {error}
          </div>
        )}
        <div className="mt-4">
          {CANCEL_REASONS.map((r) => (
            <Row key={r} onClick={() => setReason(r)} title={r} right={<Radio checked={reason === r} onChange={() => setReason(r)} />} />
          ))}
        </div>
        {isOther && (
          <div className="mt-3">
            <Input
              label="Reden"
              placeholder="Vertel ons waarom"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="px-5 pt-3 pb-2 flex flex-col gap-2">
        <Button full variant="secondary" disabled={!canSubmit || submitting} onClick={handleCancel}>
          {submitting ? "Bezig…" : "Annuleer boeking"}
        </Button>
        <Button full variant="ghost" onClick={() => router.back()}>Toch niet</Button>
      </div>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense>
      <CancelContent />
    </Suspense>
  );
}
