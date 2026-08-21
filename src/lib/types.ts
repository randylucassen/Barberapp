export type UserRole = "customer" | "barber";

// Levenscyclus van barber-verificatie (zie PROJECT.md voor de volledige
// betekenis van elke status en het adminpanel dat hier in Fase 3 op
// aangrijpt). Alleen "approved" mag zichtbaar zijn voor klanten en
// boekingen accepteren — dat gedrag zelf hoort bij het boekingensysteem
// (Fase 2+), hier alleen het datamodel.
export type BarberStatus = "pending" | "approved" | "rejected" | "suspended";

export interface Profile {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string | null;
  barberStatus: BarberStatus | null;
  onboardingCompleted: boolean;
  referralCode: string;
}

// Dag-sleutels matchen de bestaande mock DAY_LABELS in mock-data.ts.
export type Availability = Record<"Ma" | "Di" | "Wo" | "Do" | "Vr" | "Za" | "Zo", boolean>;

export interface CustomerProfile {
  id: string;
  defaultAddress: string | null;
}

export interface BarberProfile {
  id: string;
  bio: string | null;
  kvkNumber: string | null;
  city: string | null;
  address: string | null;
  workAreaKm: number;
  portfolioUrls: string[];
  insuranceDocUrl: string | null;
  idDocUrl: string | null;
  diplomaUrl: string | null;
  avatarUrl: string | null;
  iban: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  availability: Availability;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  stripeAccountId: string | null;
  stripePayoutsEnabled: boolean;
}

export interface InvoiceLineItem {
  bookingId: string;
  date: string;
  serviceName: string;
  feeInclBtwCents: number;
}

export interface BarberInvoice {
  id: string;
  invoiceNumber: number;
  barberId: string;
  periodStart: string;
  periodEnd: string;
  feeExclBtwCents: number;
  btwCents: number;
  feeInclBtwCents: number;
  lineItems: InvoiceLineItem[];
  createdAt: string;
}

export type BookingStatus =
  | "requested"
  | "accepted"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export type EscrowState = "held" | "releasing" | "released" | "paid" | "refunded";

// Echte, aan Supabase gekoppelde types (Fase 4). Bewust een andere naam
// dan de mock-shaped `Barber`/`Service`/`Booking` hieronder — die blijven
// bestaan voor de nog-niet-gewired schermen (verdiensten, reviews, enz.)
// en hebben een andere vorm (bv. `price` als hele euro's i.p.v.
// `priceCents`, geen ids/relaties).

export interface BarberServiceItem {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

// Eén dienst-regel binnen een boeking (sinds 0027, meerdere per
// boeking mogelijk) — het individuele detail achter de
// BookingRecord.serviceName-samenvatting.
export interface BookingServiceLine {
  id: string;
  serviceId: string | null;
  serviceName: string;
  quantity: number;
  unitPriceCents: number;
  unitDurationMinutes: number;
}

export interface BarberListItem {
  id: string;
  fullName: string;
  city: string | null;
  avatarUrl: string | null;
  bio: string | null;
  portfolioUrls: string[];
  ratingAvg: number | null;
  ratingCount: number;
  isOnline: boolean;
  services: BarberServiceItem[];
}

export interface BookingRecord {
  id: string;
  customerId: string;
  barberId: string | null;
  // Samenvattingstekst over alle gekozen diensten (bv. "2x Kids,
  // Knippen + baard"), sinds 0027 — geen los service_id meer, een
  // boeking kan meerdere diensten bevatten. Zie getBookingServiceLines()
  // in queries.ts voor de individuele regels.
  serviceName: string;
  // Som over alle dienst-regels (aantal x prijs/duur per regel).
  priceCents: number;
  durationMinutes: number;
  address: string;
  note: string | null;
  requestedAsap: boolean;
  scheduledAt: string | null;
  status: BookingStatus;
  cancelledReason: string | null;
  cancelledBy: UserRole | null;
  createdAt: string;
  // Gezet zodra status -> completed (Fase 6) — ankerpunt voor het
  // 24-uurs-geschillenvenster.
  completedAt: string | null;
  // Gegeocodeerd klant-adres, gezet bij het boeken — bestemming voor
  // LiveMap (0033). Kan null zijn bij een heel oude boeking van vóór
  // matching (Fase 5) of als geocoding toen mislukte.
  lat: number | null;
  lng: number | null;
  // Live positie van de barber tijdens accepted/en_route (0033), zie
  // updateBookingLiveLocation() in queries.ts.
  barberLiveLat: number | null;
  barberLiveLng: number | null;
  barberLocationUpdatedAt: string | null;
}

// Fase 6 — alleen select-baar door de klant/barber van de eigen boeking
// (payments-RLS), nooit client-schrijfbaar (zie 0003/0009).
export interface PaymentRecord {
  id: string;
  bookingId: string;
  amountCents: number;
  platformFeeCents: number;
  barberPayoutCents: number;
  escrowState: EscrowState;
  heldAt: string;
  releasedAt: string | null;
  paidOutAt: string | null;
}

// Matcht de bestaande notification_type-enum (Fase 2, uitgebreid in
// Fase 9 met wallet_topup/referral_bonus (0014), in de pre-launch audit
// met completed/cancelled (0017), en met review_received (0032, barber
// krijgt nu een melding zodra een klant een review achterlaat).
export type NotificationType =
  | "new_request"
  | "accepted"
  | "en_route"
  | "arrived"
  | "completed"
  | "cancelled"
  | "payment_received"
  | "review_reminder"
  | "review_received"
  | "booking_reminder"
  | "dispute"
  | "wallet_topup"
  | "referral_bonus"
  | "invoice_available"
  | "invoice_address_missing";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  relatedBookingId: string | null;
  read: boolean;
  createdAt: string;
}

// Resultaat van find_nearest_eligible_barber() (Fase 5) — bewust geen naam
// of coördinaten, alleen wat nodig is om een prijsindicatie te tonen.
export interface NearestBarberMatchedService {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}

export interface NearestBarberMatch {
  barberId: string;
  services: NearestBarberMatchedService[];
  distanceKm: number;
}

export interface Barber {
  id: string;
  name: string;
  rating: string;
  rides: number;
  eta: string;
  price: number;
  dist: string;
}

export interface Service {
  id: string;
  name: string;
  duration: string;
  price: number;
}

export interface Booking {
  id: string;
  customerName: string;
  barberName: string;
  service: string;
  price: number;
  address: string;
  status: BookingStatus;
  when: string;
}

export interface EarningsDay {
  label: string;
  value: number;
}

export interface Review {
  name: string;
  stars: number;
  text: string;
  when: string;
}

// Echte, aan Supabase gekoppelde reviews (Fase 7) — via
// get_barber_reviews(), die de reviewer-naam meegeeft zonder profiles-RLS
// te verruimen.
export interface ReviewRecord {
  id: string;
  stars: number;
  text: string | null;
  createdAt: string;
  reviewerName: string;
}

export interface Payout {
  label: string;
  sub: string;
  amount: string;
  state: EscrowState;
  badge: "Vast" | "Vrijgegeven" | "Uitbetaald";
}

// Fase 9 — wallet, loyaliteit, opwaarderen, kortingscodes, referral.
// Zie "Fase 9 — architectuur" in PROJECT.md en 0014_wallet_loyalty_fase9.sql.

export type WalletLedgerEntryType =
  | "topup"
  | "topup_bonus"
  | "loyalty_redemption"
  | "referral_bonus_referrer"
  | "referral_bonus_referee";

export type LoyaltyLedgerEntryType = "earned" | "redeemed";

export type WalletTopupStatus = "pending" | "succeeded" | "failed";

export interface WalletRecord {
  id: string;
  balanceCents: number;
  loyaltyPoints: number;
  updatedAt: string;
}

export interface WalletLedgerEntry {
  id: string;
  entryType: WalletLedgerEntryType;
  amountCents: number;
  balanceAfterCents: number;
  note: string | null;
  createdAt: string;
}

export interface LoyaltyLedgerEntry {
  id: string;
  entryType: LoyaltyLedgerEntryType;
  points: number;
  pointsBalanceAfter: number;
  relatedBookingId: string | null;
  createdAt: string;
}

export interface WalletTopup {
  id: string;
  amountCents: number;
  bonusCents: number;
  status: WalletTopupStatus;
  createdAt: string;
  succeededAt: string | null;
}

export interface DiscountPreview {
  discountType: "percentage" | "fixed";
  value: number;
}

export interface ReferralStats {
  referralCode: string;
  referredCount: number;
  totalBonusCents: number;
}
