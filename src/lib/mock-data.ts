import { Barber, Booking, EarningsDay, Payout, Review, Service } from "./types";

// Alle mock data hier is bewust 1-op-1 overgenomen uit de klikbare
// design-prototypes (ui_kits/) zodat de UI en de copy exact overeenkomen
// met de goedgekeurde designs. Vervang dit bestand door echte API-calls
// zodra de backend (Fase 3+) beschikbaar is.

export const CURRENT_CUSTOMER = {
  name: "Mo Idrissi",
  email: "mo@voorbeeld.nl",
  address: "Keizersgracht 112, Amsterdam",
};

export const CURRENT_BARBER = {
  name: "Yusuf El Amrani",
  rating: "4,9",
  rides: 412,
  city: "Amsterdam",
  workAreaKm: 8,
  iban: "NL91 ABNA •••• 2405",
};

export const BARBERS: Barber[] = [
  { id: "yusuf", name: "Yusuf El Amrani", rating: "4,9", rides: 412, eta: "12 min", price: 35, dist: "2,4 km" },
  { id: "dylan", name: "Dylan Vermeer", rating: "4,8", rides: 288, eta: "18 min", price: 32, dist: "3,1 km" },
  { id: "samir", name: "Samir Bouali", rating: "5,0", rides: 167, eta: "25 min", price: 40, dist: "4,8 km" },
];

export const SERVICES: Service[] = [
  { id: "knip", name: "Knipbeurt", duration: "30 min", price: 35 },
  { id: "baard", name: "Baard trimmen", duration: "20 min", price: 20 },
  { id: "knipbaard", name: "Knippen + baard", duration: "45 min", price: 50 },
];

export const CURRENT_BOOKING: Booking = {
  id: "bk_1",
  customerName: "Mo Idrissi",
  barberName: "Yusuf El Amrani",
  service: "Knipbeurt",
  price: 35,
  address: "Keizersgracht 112, Amsterdam",
  status: "en_route",
  when: "Vandaag, zo snel mogelijk",
};

export const INCOMING_REQUEST = {
  customerName: "Mo Idrissi",
  rating: "4,8",
  rides: 23,
  service: "Knipbeurt",
  price: 35,
  earning: 29.75,
  address: "Keizersgracht 112",
  distance: "2,4 km · ±8 min rijden",
};

export const TODAY_BOOKINGS_FOR_BARBER: Booking[] = [
  { id: "bk_2", customerName: "Tom de Wit", barberName: "Yusuf El Amrani", service: "Knipbeurt", price: 35, address: "Jordaan", status: "accepted", when: "15:30" },
  { id: "bk_3", customerName: "Karim Aziz", barberName: "Yusuf El Amrani", service: "Knippen + baard", price: 50, address: "De Pijp", status: "requested", when: "17:00" },
];

export const EARNINGS_WEEK: EarningsDay[] = [
  { label: "Ma", value: 42 },
  { label: "Di", value: 0 },
  { label: "Wo", value: 86 },
  { label: "Do", value: 64 },
  { label: "Vr", value: 128 },
  { label: "Za", value: 157 },
  { label: "Zo", value: 30 },
];

export const RECENT_EARNINGS = [
  { name: "Mo Idrissi", sub: "Knipbeurt · vandaag 14:55", amount: "+€29,75" },
  { name: "Tom de Wit", sub: "Knippen + baard · gisteren", amount: "+€42,50" },
];

export const PAYOUTS: Payout[] = [
  { label: "Mo Idrissi · €29,75", sub: "Vastgezet · knipbeurt vandaag 14:25", amount: "€29,75", state: "held", badge: "Vast" },
  { label: "Tom de Wit · €42,50", sub: "Vrijgegeven · gisteren afgerond", amount: "€42,50", state: "released", badge: "Vrijgegeven" },
  { label: "Week 27 · €389,25", sub: "Uitbetaald · vr 3 juli", amount: "€389,25", state: "paid", badge: "Uitbetaald" },
];

export const REVIEWS: Review[] = [
  { name: "Mo Idrissi", stars: 5, text: "Strakke fade, kwam precies op tijd. Aanrader!", when: "vandaag" },
  { name: "Tom de Wit", stars: 5, text: "Super handig dat hij naar kantoor komt.", when: "gisteren" },
  { name: "Karim Aziz", stars: 4, text: "Goede knipbeurt, iets later dan gepland.", when: "vorige week" },
];

export const NOTIFICATIONS_CUSTOMER = [
  { title: "Yusuf is onderweg", sub: "Aankomst rond 14:25 · 2 min geleden", accent: true },
  { title: "Betaling vastgezet", sub: "€37,50 wordt na afloop uitbetaald · 5 min geleden", accent: true },
  { title: "Boeking afgerond", sub: "Bedankt! Laat een review achter · 2 weken geleden", accent: false },
  { title: "Welkom bij Groomy", sub: "Boek je eerste barber op locatie · 3 weken geleden", accent: false },
];

export const CANCEL_REASONS = ["Barber duurt te lang", "Verkeerd adres gekozen", "Plannen gewijzigd", "Anders"];

export const AVAILABILITY_DEFAULT: Record<string, boolean> = {
  Ma: true, Di: true, Wo: true, Do: true, Vr: true, Za: true, Zo: false,
};

export const DAY_LABELS: Record<string, string> = {
  Ma: "Maandag", Di: "Dinsdag", Wo: "Woensdag", Do: "Donderdag", Vr: "Vrijdag", Za: "Zaterdag", Zo: "Zondag",
};
