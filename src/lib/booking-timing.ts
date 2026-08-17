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
