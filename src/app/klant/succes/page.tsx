"use client";
import { Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getBooking, getPayment } from "@/lib/supabase/queries";
import { computePriceBreakdown, euro } from "@/lib/pricing";
import type { BookingRecord } from "@/lib/types";

const POLL_MS = 2000;
// Ná deze poging tonen we "duurt langer dan verwacht" (30s) — maar we
// blijven gewoon doorpollen, want de reconcile-payments-cron (elke 2
// minuten, zie payment-reconcile.ts) vangt een gemiste eerste webhook-
// aflevering vanzelf op. Voorheen stopte het pollen hier hard, waardoor
// de klant op een dode pagina bleef staan terwijl de betaling alsnog
// binnen enkele minuten bevestigd werd — moest dan zelf terugnavigeren
// om het te zien.
const SOFT_TIMEOUT_ATTEMPTS = 15;
// Absolute bovengrens: ruim boven de cron-cadans (2 min) + marge, zodat
// een écht mislukte/nooit-bevestigde betaling niet voor altijd blijft
// pollen.
const MAX_ATTEMPTS = 100;

function SuccessContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [barberName, setBarberName] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    const supabase = createClient();
    (async () => {
      const b = await getBooking(supabase, bookingId);
      setBooking(b);
      if (b?.barberId) {
        const { data } = await supabase
          .from("approved_barbers")
          .select("full_name")
          .eq("id", b.barberId)
          .single();
        if (data) setBarberName(data.full_name);
      }
    })();

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      // Een mislukte tick (bv. even geen netwerk) telt gewoon mee als
      // poging, maar mag de polling niet laten crashen — anders loopt de
      // klant hier vast op een kale foutmelding i.p.v. een nette timeout.
      try {
        const payment = await getPayment(supabase, bookingId);
        if (payment) {
          setPaid(true);
          clearInterval(interval);
          return;
        }
      } catch {
        // niets doen, telt als mislukte poging hieronder
      }
      if (attempts >= SOFT_TIMEOUT_ATTEMPTS) {
        setTimedOut(true);
      }
      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(interval);
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [bookingId]);

  const { totalCents } = computePriceBreakdown(booking?.priceCents ?? 0);
  const firstName = barberName?.split(" ")[0] ?? "Je barber";

  if (!paid) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-7 text-center">
        <div className="w-[88px] h-[88px] rounded-full bg-surface text-text-secondary flex items-center justify-center">
          <Check size={40} />
        </div>
        <div className="text-[22px] font-bold tracking-[-0.01em] mt-6">
          {timedOut ? "Betaling wordt nog verwerkt" : "Betaling verwerken…"}
        </div>
        <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
          {timedOut
            ? "Dit duurt langer dan verwacht. Je boeking staat klaar zodra de betaling is bevestigd — check je boekingen zo dadelijk nog eens."
            : "Even geduld, we bevestigen je betaling."}
        </div>
        {timedOut && (
          <div className="mt-8 w-full flex flex-col gap-2.5">
            <Button full variant="accent" onClick={() => router.push(`/klant/status?bookingId=${bookingId}`)}>
              Naar je boeking
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-7 text-center">
      <div className="w-[88px] h-[88px] rounded-full bg-primary text-accent flex items-center justify-center">
        <Check size={40} />
      </div>
      <div className="text-[28px] font-bold tracking-[-0.02em] mt-6">Boeking bevestigd</div>
      <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
        {firstName} heeft je aanvraag ontvangen. Je betaling van{" "}
        <b className="text-text-primary">€{euro(totalCents)}</b> staat veilig vast tot na afloop.
      </div>
      <div className="mt-8 w-full flex flex-col gap-2.5">
        <Button full variant="accent" onClick={() => router.push(`/klant/status?bookingId=${bookingId}`)}>
          Volg je barber
        </Button>
        <Button full variant="ghost" onClick={() => router.push("/klant/home")}>Naar home</Button>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
