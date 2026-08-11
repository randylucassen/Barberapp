import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Eén singleton-promise, zoals Stripe's eigen documentatie voorschrijft —
// loadStripe() buiten component-render aanroepen, nooit per render opnieuw.
let stripePromise: Promise<Stripe | null> | undefined;

export function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}
