"use client";
import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Button, Input, NavBar } from "@/components/ui";
import { euro } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe-client";
import {
  WALLET_MAX_TOPUP_CENTS,
  WALLET_MIN_TOPUP_CENTS,
  WALLET_TOPUP_AMOUNT_CHOICES_CENTS,
  computeTopupBonus,
} from "@/lib/wallet";

function CheckoutForm({ totalCents, successPath }: { totalCents: number; successPath: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}${successPath}` },
    });
    if (confirmError) {
      setError(confirmError.message ?? "Betaling mislukt. Probeer het opnieuw.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="mt-5">
        <PaymentElement onLoadError={(e) => setError(`Kon het betaalformulier niet laden: ${e.error.message}`)} />
      </div>
      {error && (
        <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
          {error}
        </div>
      )}
      <div className="mt-5">
        <Button full variant="accent" disabled={!stripe || submitting} onClick={handlePay}>
          {submitting ? "Bezig…" : `Betaal €${euro(totalCents)}`}
        </Button>
      </div>
    </>
  );
}

interface TopupCheckoutProps {
  onBack: () => void;
  successPath: string;
}

// Gedeeld tussen /klant/wallet/opwaarderen en /barber/wallet/opwaarderen.
// Twee stappen in één component: bedrag kiezen (client-only, geen
// server-call) → pas bij "Doorgaan" wordt /api/wallet/create-topup-intent
// aangeroepen en verschijnt de Stripe Payment Element, zelfde structuur
// als klant/betaling.
export function TopupCheckout({ onBack, successPath }: TopupCheckoutProps) {
  const [amountCents, setAmountCents] = useState(WALLET_TOPUP_AMOUNT_CHOICES_CENTS[1]);
  const [customEuro, setCustomEuro] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [topupId, setTopupId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmountCents = customEuro ? Math.round(parseFloat(customEuro.replace(",", ".")) * 100) : amountCents;
  const validAmount =
    Number.isFinite(effectiveAmountCents) &&
    effectiveAmountCents >= WALLET_MIN_TOPUP_CENTS &&
    effectiveAmountCents <= WALLET_MAX_TOPUP_CENTS;
  const bonusCents = validAmount ? computeTopupBonus(effectiveAmountCents) : 0;

  async function handleContinue() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/create-topup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: effectiveAmountCents }),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setTopupId(data.topupId);
      } else {
        setError(data.error ?? "Kon de opwaardering niet starten.");
      }
    } catch {
      setError("Kon de opwaardering niet starten.");
    }
    setStarting(false);
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Opwaarderen" onBack={clientSecret ? () => setClientSecret(null) : onBack} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {!clientSecret ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {WALLET_TOPUP_AMOUNT_CHOICES_CENTS.map((cents) => (
                <button
                  key={cents}
                  onClick={() => {
                    setAmountCents(cents);
                    setCustomEuro("");
                  }}
                  className={`h-ctrl-lg rounded-md font-semibold text-[17px] transition-all duration-fast ease-groomy ${
                    !customEuro && amountCents === cents
                      ? "bg-primary text-white"
                      : "bg-surface text-text-primary active:bg-[#EFEFEF]"
                  }`}
                >
                  €{euro(cents)}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Input
                label="Ander bedrag"
                leading="€"
                inputMode="decimal"
                placeholder="0,00"
                value={customEuro}
                onChange={(e) => setCustomEuro(e.target.value)}
              />
            </div>
            {bonusCents > 0 && (
              <div className="mt-4 bg-accent-soft text-accent-dark text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
                Je krijgt er <b>€{euro(bonusCents)} bonus</b> gratis bij.
              </div>
            )}
            {error && (
              <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
                {error}
              </div>
            )}
            <div className="mt-6">
              <Button full variant="accent" disabled={!validAmount || starting} onClick={handleContinue}>
                {starting ? "Bezig…" : "Doorgaan"}
              </Button>
            </div>
          </>
        ) : (
          <Elements stripe={getStripe()} options={{ clientSecret }}>
            <CheckoutForm totalCents={effectiveAmountCents} successPath={`${successPath}?topupId=${topupId}`} />
          </Elements>
        )}
      </div>
    </div>
  );
}
