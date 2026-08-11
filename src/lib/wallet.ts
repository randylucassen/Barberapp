// Wallet-, loyaliteits- en referral-constanten. De topup-bonus wordt
// hier daadwerkelijk gebruikt (in /api/wallet/create-topup-intent) — dat
// is de bron van waarheid. De loyaliteits-/referral-bedragen hieronder
// zijn display-only (voor UI-preview): de echte berekening staat
// hardcoded in supabase/migrations/0014_wallet_loyalty_fase9.sql (SQL
// kan geen TypeScript-import lezen), dus deze constanten moeten in sync
// blijven met die migratie — zelfde geaccepteerde duplicatie-precedent
// als het 24-uurs-venster tussen release-escrow/route.ts en de migraties.

export const WALLET_MIN_TOPUP_CENTS = 500;
export const WALLET_MAX_TOPUP_CENTS = 100_000;
export const WALLET_TOPUP_BONUS_THRESHOLD_CENTS = 5000;
export const WALLET_TOPUP_BONUS_RATE = 0.1;

export function computeTopupBonus(amountCents: number): number {
  return amountCents >= WALLET_TOPUP_BONUS_THRESHOLD_CENTS
    ? Math.round(amountCents * WALLET_TOPUP_BONUS_RATE)
    : 0;
}

export const WALLET_TOPUP_AMOUNT_CHOICES_CENTS = [1000, 2500, 5000, 10000];

// Display-only — zie opmerking bovenaan dit bestand.
export const LOYALTY_POINTS_PER_EURO_SPENT = 1;
export const LOYALTY_POINT_VALUE_CENTS = 1;
export const LOYALTY_MIN_REDEEM_POINTS = 500;
export const REFERRAL_REFERRER_BONUS_CENTS = 500;
export const REFERRAL_REFEREE_BONUS_CENTS = 500;
