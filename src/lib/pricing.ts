// Enige bron van waarheid voor de servicekosten-berekening — vervangt de
// verspreide inline `* 0.15`/`* 0.85` in klant/betaling, klant/succes en
// barber/aanvraag. Moet op de server exact hetzelfde resultaat geven als
// hier, want /api/stripe/create-payment-intent gebruikt dezelfde functie
// om het te betalen bedrag te bepalen (nooit een clientside bedrag
// vertrouwen).

export const PLATFORM_FEE_RATE = 0.15;

export interface PriceBreakdown {
  priceCents: number;
  feeCents: number;
  totalCents: number;
  barberPayoutCents: number;
}

export function computePriceBreakdown(priceCents: number): PriceBreakdown {
  const feeCents = Math.round(priceCents * PLATFORM_FEE_RATE);
  return {
    priceCents,
    feeCents,
    totalCents: priceCents + feeCents,
    barberPayoutCents: priceCents - feeCents,
  };
}

export function euro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
