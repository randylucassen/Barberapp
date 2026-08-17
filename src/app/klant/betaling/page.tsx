"use client";
import { Shield, Tag } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getBooking, previewDiscountCode } from "@/lib/supabase/queries";
import { getStripe } from "@/lib/stripe-client";
import { computePriceBreakdown, euro } from "@/lib/pricing";
import type { BookingRecord, DiscountPreview } from "@/lib/types";

function CheckoutForm({ bookingId, totalCents }: { bookingId: string; totalCents: number }) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    // redirect: "if_required" — zonder deze optie stuurt Stripe.js élke
    // betaling (ook een kaart zonder 3D Secure-stap) via een volledige
    // pagina-rondreis naar een Stripe-gehoste pagina en terug, ook als dat
    // niet nodig is. Alleen betaalmethodes die dat daadwerkelijk vereisen
    // (iDEAL is altijd een bank-redirect, een kaart met 3DS-uitdaging soms)
    // verlaten deze pagina nog; de rest rondt hier meteen af.
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/klant/succes?bookingId=${bookingId}` },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Betaling mislukt. Probeer het opnieuw.");
      setSubmitting(false);
      return;
    }
    if (paymentIntent) {
      router.push(`/klant/succes?bookingId=${bookingId}&payment_intent=${paymentIntent.id}`);
    }
  }

  return (
    <>
      <div className="mt-5">
        <PaymentElement
          onLoadError={(e) => setError(`Kon het betaalformulier niet laden: ${e.error.message}`)}
        />
      </div>
      {error && (
        <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
          {error}
        </div>
      )}
      <div className="mt-5 px-0">
        <Button full variant="accent" disabled={!stripe || submitting} onClick={handlePay}>
          {submitting ? "Bezig…" : `Betaal €${euro(totalCents)}`}
        </Button>
      </div>
    </>
  );
}

function estimateDiscountCents(preview: DiscountPreview, totalCents: number): number {
  const raw = preview.discountType === "percentage" ? Math.round((totalCents * preview.value) / 100) : preview.value;
  return Math.min(raw, Math.max(totalCents - 50, 0));
}

function PaymentContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [chargedTotalCents, setChargedTotalCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountPreview | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const intentRequested = useRef(false);

  useEffect(() => {
    if (!bookingId) {
      router.replace("/klant/home");
      return;
    }
    const supabase = createClient();
    getBooking(supabase, bookingId).then(setBooking);
  }, [bookingId, router]);

  const priceCents = booking?.priceCents ?? 0;
  const { feeCents, totalCents } = computePriceBreakdown(priceCents);
  const discountPreviewCents = appliedDiscount ? estimateDiscountCents(appliedDiscount, totalCents) : 0;

  async function handleApplyCode() {
    if (!discountCodeInput.trim()) return;
    setCheckingCode(true);
    setDiscountError(null);
    const supabase = createClient();
    const preview = await previewDiscountCode(supabase, discountCodeInput.trim());
    if (preview) {
      setAppliedDiscount(preview);
    } else {
      setAppliedDiscount(null);
      setDiscountError("Ongeldige of verlopen code");
    }
    setCheckingCode(false);
  }

  function handleStartPayment() {
    // React 19 dev/StrictMode voert effects dubbel uit — hier geen effect
    // meer (de intent wordt pas op klik gestart), maar de guard blijft
    // nodig omdat "Doorgaan" ook per ongeluk dubbel geklikt kan worden:
    // create-payment-intent maakt een echte, niet-idempotente Stripe
    // PaymentIntent aan (en verzilvert bij een code meteen de redemption).
    if (intentRequested.current || !bookingId) return;
    intentRequested.current = true;
    setStarting(true);
    setError(null);

    fetch("/api/stripe/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, discountCode: appliedDiscount ? discountCodeInput.trim() : undefined }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
          setChargedTotalCents(data.totalCents ?? totalCents);
        } else {
          setError(data.error ?? "Kon de betaling niet starten.");
          intentRequested.current = false;
        }
      })
      .catch(() => {
        setError("Kon de betaling niet starten.");
        intentRequested.current = false;
      })
      .finally(() => setStarting(false));
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Betaling" onBack={() => router.back()} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="bg-accent-soft rounded-md px-4 py-3.5 flex gap-3 items-start">
          <span className="text-accent-dark flex-shrink-0 mt-px"><Shield size={18} /></span>
          <div className="text-[13px] text-accent-dark leading-[19px]">
            <b>Veilig betalen.</b> Je betaling wordt vastgehouden en pas na afloop van de knipbeurt aan de barber uitbetaald.
          </div>
        </div>

        {!clientSecret && (
          <div className="mt-5 flex gap-2 items-end">
            <Input
              label="Kortingscode"
              leading={<Tag size={16} />}
              placeholder="Optioneel"
              value={discountCodeInput}
              onChange={(e) => {
                setDiscountCodeInput(e.target.value);
                setAppliedDiscount(null);
                setDiscountError(null);
              }}
              className="flex-1"
            />
            <Button
              size="lg"
              variant="secondary"
              disabled={!discountCodeInput.trim() || checkingCode}
              onClick={handleApplyCode}
            >
              {checkingCode ? "…" : "Toepassen"}
            </Button>
          </div>
        )}
        {discountError && (
          <div className="mt-2 text-[13px] text-error">{discountError}</div>
        )}

        <div className="mt-5">
          <div className="flex justify-between text-[15px] py-1.5">
            <span className="text-text-secondary">{booking?.serviceName ?? "Dienst"}</span>
            <span>€{euro(priceCents)}</span>
          </div>
          <div className="flex justify-between text-[15px] py-1.5">
            <span className="text-text-secondary">Servicekosten</span>
            <span>€{euro(feeCents)}</span>
          </div>
          {appliedDiscount && (
            <div className="flex justify-between text-[15px] py-1.5 text-success">
              <span>Korting</span>
              <span>-€{euro(discountPreviewCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-[17px] font-bold py-2.5 border-t border-border-soft mt-1.5">
            <span>Totaal</span>
            <span>€{euro(chargedTotalCents ?? totalCents - discountPreviewCents)}</span>
          </div>
        </div>

        {clientSecret ? (
          <Elements stripe={getStripe()} options={{ clientSecret }}>
            <CheckoutForm bookingId={bookingId!} totalCents={chargedTotalCents ?? totalCents} />
          </Elements>
        ) : error ? (
          <div className="mt-5 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        ) : (
          <div className="mt-5">
            <Button full variant="accent" disabled={!booking || starting} onClick={handleStartPayment}>
              {starting ? "Bezig…" : "Doorgaan naar betalen"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense>
      <PaymentContent />
    </Suspense>
  );
}
