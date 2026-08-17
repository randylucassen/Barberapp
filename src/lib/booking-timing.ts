import type { BookingStatus } from "@/lib/types";

// Hoe ver van tevoren een barber een geplande (niet-asap) boeking mag
// "starten" — daarvoor blijft de boeking gewoon "bevestigd, gepland",
// zonder live-kaart/GPS-tracking en zonder de rit-flow te openen. Zie
// CLAUDE.md-changelog voor de volledige toelichting.
export const RIDE_START_WINDOW_MS = 2 * 60 * 60 * 1000;

// Bepaalt of een geaccepteerde boeking al als "actieve rit" mag gelden.
// Eenmaal voorbij 'accepted' (en_route/arrived/in_progress) is de rit per
// definitie al gestart, dus altijd waar. Een asap-boeking of eentje zonder
// scheduled_at is altijd meteen due. Een geplande boeking pas binnen het
// RIDE_START_WINDOW_MS-venster voor scheduled_at.
export function isRideDue(booking: {
  status: BookingStatus;
  requestedAsap: boolean;
  scheduledAt: string | null;
}): boolean {
  if (booking.status !== "accepted") return true;
  if (booking.requestedAsap || !booking.scheduledAt) return true;
  return new Date(booking.scheduledAt).getTime() - Date.now() <= RIDE_START_WINDOW_MS;
}

// Hoe kort van tevoren annuleren door de klant nog geld kost — zelfde
// venster als het "1 uur vooraf"-label dat al overal in de UI stond,
// alleen was er nooit logica die dat afdwong (elke annulering was altijd
// 100% gratis, ongeacht timing). Zie CLAUDE.md-changelog.
export const CANCELLATION_FEE_WINDOW_MS = 60 * 60 * 1000;
// Percentage van het dienstbedrag (dus ná aftrek van de servicekosten —
// die blijft de klant sowieso altijd volledig betalen, annulering of
// niet) dat de klant kwijt is bij een late annulering. De rest van dat
// dienstbedrag gaat als compensatie naar de barber, min de normale 15%
// servicekosten daarop (zie /api/stripe/cancel-and-refund).
export const CANCELLATION_FEE_PERCENTAGE = 50;

// Bepaalt of een late-annuleringskosten van toepassing is. Alleen
// relevant zodra een barber daadwerkelijk iets gereserveerd/geïnvesteerd
// heeft:
// - Zodra de barber al onderweg is (of verder) — geldt voor zowel asap-
//   als geplande boekingen, want vanaf dat moment is de rijtijd al
//   geïnvesteerd, los van hoe ver "scheduled_at" nog weg is.
// - Voor een geaccepteerde, geplande (niet-asap) boeking: binnen het
//   CANCELLATION_FEE_WINDOW_MS-venster vóór scheduled_at.
// Een nog-niet-geaccepteerde ('requested') of net-geaccepteerde asap-
// boeking (barber nog niet vertrokken) blijft altijd gratis annuleerbaar.
export function cancellationFeeApplies(booking: {
  status: BookingStatus;
  requestedAsap: boolean;
  scheduledAt: string | null;
}): boolean {
  if (["en_route", "arrived", "in_progress"].includes(booking.status)) return true;
  if (booking.status !== "accepted") return false;
  if (booking.requestedAsap || !booking.scheduledAt) return false;
  return new Date(booking.scheduledAt).getTime() - Date.now() < CANCELLATION_FEE_WINDOW_MS;
}
