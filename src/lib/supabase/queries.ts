import type { SupabaseClient } from "@supabase/supabase-js";
import { isRideDue } from "@/lib/booking-timing";
import type {
  AppNotification,
  BarberListItem,
  BarberProfile,
  BarberStatus,
  BookingRecord,
  BookingServiceLine,
  BookingStatus,
  CustomerProfile,
  DiscountPreview,
  EscrowState,
  LoyaltyLedgerEntry,
  NearestBarberMatch,
  PaymentRecord,
  Profile,
  ReferralStats,
  ReviewRecord,
  UserRole,
  WalletLedgerEntry,
  WalletRecord,
  WalletTopup,
} from "@/lib/types";

export const ROLE_HOME: Record<UserRole, string> = {
  customer: "/klant/home",
  barber: "/barber/dashboard",
};

export const ROLE_LOGIN: Record<UserRole, string> = {
  customer: "/klant/login",
  barber: "/barber/login",
};

interface ProfileRow {
  id: string;
  role: UserRole;
  full_name: string;
  email: string;
  phone: string | null;
  barber_status: Profile["barberStatus"];
  onboarding_completed: boolean;
  referral_code: string;
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    barberStatus: row.barber_status,
    onboardingCompleted: row.onboarding_completed,
    referralCode: row.referral_code,
  };
}

export async function getProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, phone, barber_status, onboarding_completed, referral_code")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return mapProfile(data as ProfileRow);
}

interface BarberProfileRow {
  id: string;
  bio: string | null;
  kvk_number: string | null;
  city: string | null;
  work_area_km: number;
  portfolio_urls: string[];
  insurance_doc_url: string | null;
  id_doc_url: string | null;
  diploma_url: string | null;
  avatar_url: string | null;
  iban: string | null;
  rating_avg: number | null;
  rating_count: number;
  availability: BarberProfile["availability"];
  is_online: boolean;
  lat: number | null;
  lng: number | null;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
}

function mapBarberProfile(row: BarberProfileRow): BarberProfile {
  return {
    id: row.id,
    bio: row.bio,
    kvkNumber: row.kvk_number,
    city: row.city,
    workAreaKm: row.work_area_km,
    portfolioUrls: row.portfolio_urls,
    insuranceDocUrl: row.insurance_doc_url,
    idDocUrl: row.id_doc_url,
    diplomaUrl: row.diploma_url,
    avatarUrl: row.avatar_url,
    iban: row.iban,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    availability: row.availability,
    isOnline: row.is_online,
    lat: row.lat,
    lng: row.lng,
    stripeAccountId: row.stripe_account_id,
    stripePayoutsEnabled: row.stripe_payouts_enabled,
  };
}

export async function getBarberProfile(
  supabase: SupabaseClient,
  // Ongebruikt sinds de kolom-grant-lockdown in 0020: get_own_barber_profile
  // leest altijd de eigen rij via auth.uid(), niet via een meegegeven id —
  // param blijft staan om alle 7 bestaande call sites (die toch altijd de
  // eigen ingelogde id doorgeven) ongewijzigd te laten.
  _userId: string
): Promise<BarberProfile | null> {
  const { data, error } = await supabase.rpc("get_own_barber_profile").single();

  if (error || !data) return null;
  return mapBarberProfile(data as BarberProfileRow);
}

export async function getCustomerProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<CustomerProfile | null> {
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("id, default_address")
    .eq("id", userId)
    .single();
  if (error || !data) return null;
  return { id: data.id, defaultAddress: data.default_address };
}

export async function updateDefaultAddress(
  supabase: SupabaseClient,
  userId: string,
  address: string
): Promise<boolean> {
  const { error } = await supabase
    .from("customer_profiles")
    .update({ default_address: address })
    .eq("id", userId);
  return !error;
}

export async function updatePersonalInfo(
  supabase: SupabaseClient,
  userId: string,
  input: { fullName: string; phone: string | null }
): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.fullName, phone: input.phone })
    .eq("id", userId);
  return !error;
}

// ============================================================
// Barbers & diensten (klant-facing, Fase 4)
// ============================================================

interface ApprovedBarberRow {
  id: string;
  full_name: string;
  city: string | null;
  avatar_url: string | null;
  rating_avg: number | null;
  rating_count: number;
}

interface ServiceRow {
  id: string;
  barber_id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
}

export async function getApprovedBarbersWithServices(
  supabase: SupabaseClient
): Promise<BarberListItem[]> {
  const { data: barbers, error } = await supabase
    .from("approved_barbers")
    .select("id, full_name, city, avatar_url, rating_avg, rating_count");
  if (error || !barbers) return [];

  const { data: services } = await supabase
    .from("services")
    .select("id, barber_id, name, duration_minutes, price_cents")
    .eq("active", true);

  // Losse query (niet embedden via approved_barbers, dat is een view) —
  // alleen de kolom die hier nodig is, i.p.v. de hele barber_profiles-rij.
  const { data: onlineRows } = await supabase
    .from("barber_profiles")
    .select("id, is_online")
    .in(
      "id",
      barbers.map((b) => b.id)
    );
  const onlineById = new Map((onlineRows ?? []).map((r) => [r.id as string, r.is_online as boolean]));

  return (barbers as ApprovedBarberRow[]).map((b) => ({
    id: b.id,
    fullName: b.full_name,
    city: b.city,
    avatarUrl: b.avatar_url,
    ratingAvg: b.rating_avg,
    ratingCount: b.rating_count,
    isOnline: onlineById.get(b.id) ?? false,
    services: ((services as ServiceRow[]) ?? [])
      .filter((s) => s.barber_id === b.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.duration_minutes,
        priceCents: s.price_cents,
      })),
  }));
}

export async function getFavoriteBarberIds(supabase: SupabaseClient, customerId: string): Promise<Set<string>> {
  const { data } = await supabase.from("customer_favorite_barbers").select("barber_id").eq("customer_id", customerId);
  return new Set((data ?? []).map((r) => r.barber_id as string));
}

export async function addFavoriteBarber(supabase: SupabaseClient, customerId: string, barberId: string): Promise<boolean> {
  const { error } = await supabase
    .from("customer_favorite_barbers")
    .upsert({ customer_id: customerId, barber_id: barberId }, { onConflict: "customer_id,barber_id" });
  return !error;
}

export async function removeFavoriteBarber(supabase: SupabaseClient, customerId: string, barberId: string): Promise<boolean> {
  const { error } = await supabase
    .from("customer_favorite_barbers")
    .delete()
    .eq("customer_id", customerId)
    .eq("barber_id", barberId);
  return !error;
}

// Barbers waarmee deze klant al een afgeronde boeking heeft — bepaalt of
// "Boek vooruit" een specifieke barber mag tonen (zie
// create_booking_with_services()' server-side spiegelbeeld van deze check
// in 0029, die dit ook echt afdwingt, niet alleen hier filtert).
export async function getCompletedBarberIdsForCustomer(supabase: SupabaseClient, customerId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("bookings")
    .select("barber_id")
    .eq("customer_id", customerId)
    .eq("status", "completed");
  return new Set((data ?? []).map((r) => r.barber_id as string).filter((id): id is string => id !== null));
}

// ============================================================
// Boekingen (Fase 4)
// ============================================================

interface BookingRow {
  id: string;
  customer_id: string;
  barber_id: string | null;
  service_name_snapshot: string;
  price_cents_snapshot: number;
  duration_minutes_snapshot: number;
  address: string;
  note: string | null;
  requested_asap: boolean;
  scheduled_at: string | null;
  status: BookingStatus;
  cancelled_reason: string | null;
  cancelled_by: UserRole | null;
  created_at: string;
  completed_at: string | null;
  lat: number | null;
  lng: number | null;
  barber_live_lat: number | null;
  barber_live_lng: number | null;
  barber_location_updated_at: string | null;
}

const BOOKING_COLUMNS =
  "id, customer_id, barber_id, service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot, address, note, requested_asap, scheduled_at, status, cancelled_reason, cancelled_by, created_at, completed_at, lat, lng, barber_live_lat, barber_live_lng, barber_location_updated_at";

function mapBooking(row: BookingRow): BookingRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    barberId: row.barber_id,
    serviceName: row.service_name_snapshot,
    priceCents: row.price_cents_snapshot,
    durationMinutes: row.duration_minutes_snapshot,
    address: row.address,
    note: row.note,
    requestedAsap: row.requested_asap,
    scheduledAt: row.scheduled_at,
    status: row.status,
    cancelledReason: row.cancelled_reason,
    cancelledBy: row.cancelled_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    lat: row.lat,
    lng: row.lng,
    barberLiveLat: row.barber_live_lat,
    barberLiveLng: row.barber_live_lng,
    barberLocationUpdatedAt: row.barber_location_updated_at,
  };
}

interface BookingServiceLineRow {
  id: string;
  service_id: string | null;
  service_name_snapshot: string;
  quantity: number;
  unit_price_cents_snapshot: number;
  unit_duration_minutes_snapshot: number;
}

export async function getBookingServiceLines(supabase: SupabaseClient, bookingId: string): Promise<BookingServiceLine[]> {
  const { data } = await supabase
    .from("booking_services")
    .select("id, service_id, service_name_snapshot, quantity, unit_price_cents_snapshot, unit_duration_minutes_snapshot")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  return ((data as BookingServiceLineRow[]) ?? []).map((r) => ({
    id: r.id,
    serviceId: r.service_id,
    serviceName: r.service_name_snapshot,
    quantity: r.quantity,
    unitPriceCents: r.unit_price_cents_snapshot,
    unitDurationMinutes: r.unit_duration_minutes_snapshot,
  }));
}

export async function getBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<BookingRecord | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .single();
  if (error || !data) return null;
  return mapBooking(data as unknown as BookingRow);
}

export interface BookingServiceLineInput {
  serviceId: string;
  quantity: number;
}

export interface CreateBookingInput {
  // null = automatisch toewijzen (Fase 5) — barber claimt de aanvraag
  // later zelf, zie claimBooking().
  barberId: string | null;
  lines: BookingServiceLineInput[];
  address: string;
  note: string | null;
  requestedAsap: boolean;
  scheduledAt: string | null;
  // Alleen gezet voor automatisch-toegewezen aanvragen (Fase 5) — nodig
  // om geschikte barbers binnen straal te vinden.
  lat?: number;
  lng?: number;
}

// Enige geldige weg om een boeking aan te maken sinds 0027 — bookings
// heeft geen insert-grant meer voor authenticated, de RPC valideert en
// berekent price/duration/service_name_snapshot zelf server-side uit de
// echte services-tabel (zie create_booking_with_services() in de
// migratie voor de volledige toelichting).
export interface CreateBookingResult {
  booking: BookingRecord | null;
  // De rauwe boodschap achter een `raise exception` in de RPC (bv. de
  // vooruit-plannen-zonder-geschiedenis-check uit 0029) — specifiek
  // genoeg om rechtstreeks aan de klant te tonen i.p.v. een generieke
  // "niet gelukt"-melding.
  errorMessage: string | null;
}

export async function createBookingWithServices(
  supabase: SupabaseClient,
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  const { data: bookingId, error: rpcError } = await supabase.rpc("create_booking_with_services", {
    p_barber_id: input.barberId,
    p_address: input.address,
    p_note: input.note,
    p_requested_asap: input.requestedAsap,
    p_scheduled_at: input.scheduledAt,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_lines: input.lines.map((l) => ({ service_id: l.serviceId, quantity: l.quantity })),
  });
  if (rpcError || !bookingId) return { booking: null, errorMessage: rpcError?.message ?? null };
  return { booking: await getBooking(supabase, bookingId as string), errorMessage: null };
}

export async function updateBookingStatus(
  supabase: SupabaseClient,
  bookingId: string,
  status: BookingStatus,
  extra?: { cancelledReason?: string; cancelledBy?: UserRole }
): Promise<boolean> {
  const { error } = await supabase
    .from("bookings")
    .update({
      status,
      ...(extra?.cancelledReason ? { cancelled_reason: extra.cancelledReason } : {}),
      ...(extra?.cancelledBy ? { cancelled_by: extra.cancelledBy } : {}),
    })
    .eq("id", bookingId);
  return !error;
}

// Live positie van de barber tijdens een rit (0033) — geschreven vanaf
// barber/rit via navigator.geolocation.watchPosition(), gethrottled
// aangeroepen (niet bij elke GPS-tick). Gelezen door de klant via de
// bestaande poll van getBooking() op klant/status, geen apart kanaal.
export async function updateBookingLiveLocation(
  supabase: SupabaseClient,
  bookingId: string,
  lat: number,
  lng: number
): Promise<boolean> {
  const { error } = await supabase
    .from("bookings")
    .update({
      barber_live_lat: lat,
      barber_live_lng: lng,
      barber_location_updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);
  return !error;
}

// Meest recente boeking van deze klant die nog niet is afgerond/geannuleerd
// — gebruikt door /klant/status.
export async function getActiveBookingForCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<BookingRecord | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("customer_id", customerId)
    .not("status", "in", "(completed,cancelled)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapBooking(data as unknown as BookingRow);
}

export interface RecentBookingSummary {
  id: string;
  barberId: string;
  barberName: string;
  // Voor "Opnieuw" (bookAgain) — alleen regels met een nog bestaande,
  // actieve service_id kunnen herboekt worden (een dienst kan intussen
  // hernoemd/verwijderd zijn); lege lijst = "Opnieuw" toont niets om op
  // te herboeken (bestaande UI checkt dit al af via `!lines.length`).
  lines: BookingServiceLineInput[];
  serviceName: string;
  priceCents: number;
  durationMinutes: number;
  completedAt: string;
}

// Afgeronde boekingen voor de "Recent"-sectie op /klant/home — twee losse
// queries (niet PostgREST-embedden via approved_barbers) omdat dat een
// view is, geen tabel met een door PostgREST herkende FK-relatie.
export async function getRecentCompletedBookingsForCustomer(
  supabase: SupabaseClient,
  customerId: string,
  limit = 2
): Promise<RecentBookingSummary[]> {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, barber_id, service_name_snapshot, price_cents_snapshot, duration_minutes_snapshot, completed_at")
    .eq("customer_id", customerId)
    .eq("status", "completed")
    .not("barber_id", "is", null)
    // Postgres sorteert NULL vóóraan bij `desc` (tenzij je expliciet NULLS
    // LAST vraagt, wat PostgREST niet ondersteunt) — een boeking met
    // status='completed' maar completed_at=null (kan alleen ontstaan
    // buiten de normale statusflow om, die completed_at altijd zet, zie
    // 0009) zou anders altijd bovenaan "Recent" verschijnen i.p.v.
    // eronder, en `new Date(null)` geeft epoch 1970 → "2951 weken geleden".
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error || !bookings || bookings.length === 0) return [];

  const barberIds = [...new Set(bookings.map((b) => b.barber_id as string))];
  const bookingIds = bookings.map((b) => b.id as string);
  const [{ data: barbers }, { data: lines }] = await Promise.all([
    supabase.from("approved_barbers").select("id, full_name").in("id", barberIds),
    supabase.from("booking_services").select("booking_id, service_id, quantity").in("booking_id", bookingIds),
  ]);
  const nameById = new Map((barbers ?? []).map((b) => [b.id as string, b.full_name as string]));
  const linesByBooking = new Map<string, BookingServiceLineInput[]>();
  for (const l of lines ?? []) {
    if (!l.service_id) continue;
    const arr = linesByBooking.get(l.booking_id as string) ?? [];
    arr.push({ serviceId: l.service_id as string, quantity: l.quantity as number });
    linesByBooking.set(l.booking_id as string, arr);
  }

  return bookings
    .filter((b) => nameById.has(b.barber_id as string))
    .map((b) => ({
      id: b.id as string,
      barberId: b.barber_id as string,
      barberName: nameById.get(b.barber_id as string)!,
      lines: linesByBooking.get(b.id as string) ?? [],
      serviceName: b.service_name_snapshot as string,
      priceCents: b.price_cents_snapshot as number,
      durationMinutes: b.duration_minutes_snapshot as number,
      completedAt: b.completed_at as string,
    }));
}

// Openstaande aanvraag voor deze barber — gebruikt door /barber/dashboard
// (hasRequest) en /barber/aanvraag.
export async function getPendingRequestForBarber(
  supabase: SupabaseClient,
  barberId: string
): Promise<BookingRecord | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("barber_id", barberId)
    .eq("status", "requested")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapBooking(data as unknown as BookingRow);
}

// Actief lopende opdracht (geaccepteerd t/m in_progress) — gebruikt door
// /barber/rit. Een geaccepteerde maar nog niet "due" geplande boeking
// (zie isRideDue) telt hier bewust niet mee — anders zou een afspraak van
// volgende week meteen als actieve rit getoond worden (barber/dashboard's
// "Actieve rit"-kaart, /barber/rit zelf). We halen daarom iets breder op
// dan het uiteindelijke resultaat en filteren daarna in JS, want de
// 2-uur-drempel is niet zinvol als los PostgREST-filter uit te drukken.
export async function getActiveBookingForBarber(
  supabase: SupabaseClient,
  barberId: string
): Promise<BookingRecord | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("barber_id", barberId)
    .in("status", ["accepted", "en_route", "arrived", "in_progress"])
    .order("created_at", { ascending: false });
  if (error || !data) return null;
  const due = (data as unknown as BookingRow[]).map(mapBooking).find(isRideDue);
  return due ?? null;
}

// Geaccepteerde, geplande (niet-asap) boekingen die nog niet due zijn —
// voor de "Geplande afspraken"-sectie op /barber/dashboard. Oplopend op
// scheduled_at, niet op created_at (i.t.t. de rest van dit bestand) —
// hier gaat het om wanneer de afspraak is, niet wanneer 'm is aangemaakt.
export async function getScheduledBookingsForBarber(
  supabase: SupabaseClient,
  barberId: string
): Promise<BookingRecord[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("barber_id", barberId)
    .eq("status", "accepted")
    .eq("requested_asap", false)
    .not("scheduled_at", "is", null)
    .order("scheduled_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as BookingRow[]).map(mapBooking).filter((b) => !isRideDue(b));
}

// Checkt of een kandidaat-tijdvak overlapt met een al geaccepteerde
// geplande boeking van dezelfde barber — puur adviserend (geen db-
// constraint), gebruikt door /barber/aanvraag vóór het accepteren van een
// niet-asap aanvraag om dubbele boekingen te voorkomen. excludeBookingId
// is voor toekomstig hergebruik bij het verzetten van een bestaande
// afspraak (nu altijd undefined bij accept()).
export async function getConflictingScheduledBooking(
  supabase: SupabaseClient,
  barberId: string,
  scheduledAt: string,
  durationMinutes: number,
  excludeBookingId?: string
): Promise<BookingRecord | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("barber_id", barberId)
    .eq("status", "accepted")
    .eq("requested_asap", false)
    .not("scheduled_at", "is", null);
  if (error || !data) return null;

  const candidateStart = new Date(scheduledAt).getTime();
  const candidateEnd = candidateStart + durationMinutes * 60000;

  const conflict = (data as unknown as BookingRow[])
    .map(mapBooking)
    .filter((b) => b.id !== excludeBookingId)
    .find((b) => {
      if (!b.scheduledAt) return false;
      const existingStart = new Date(b.scheduledAt).getTime();
      const existingEnd = existingStart + b.durationMinutes * 60000;
      return candidateStart < existingEnd && existingStart < candidateEnd;
    });
  return conflict ?? null;
}

// Naam van de klant achter een boeking — via de security-definer functie
// get_booking_customer_name (0005), want profiles is verder alleen de
// eigen rij zichtbaar. Geeft null als de aanroeper niet de toegewezen
// barber van deze boeking is.
export async function getBookingCustomerName(
  supabase: SupabaseClient,
  bookingId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_booking_customer_name", {
    p_booking_id: bookingId,
  });
  if (error || !data) return null;
  return data as string;
}

// Telefoonnummer van de klant/barber achter een boeking (het nummer dat
// bij registreren is opgegeven, profiles.phone) — voor de Bel/Bericht-
// knoppen op barber/rit resp. klant/status. Zelfde security-definer-
// patroon/scope als getBookingCustomerName hierboven (0031).
export async function getBookingCustomerPhone(
  supabase: SupabaseClient,
  bookingId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_booking_customer_phone", {
    p_booking_id: bookingId,
  });
  if (error || !data) return null;
  return data as string;
}

export async function getBookingBarberPhone(
  supabase: SupabaseClient,
  bookingId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_booking_barber_phone", {
    p_booking_id: bookingId,
  });
  if (error || !data) return null;
  return data as string;
}

// Recente niet-aangevraagde boekingen (geaccepteerd/lopend/afgerond) voor
// het dashboard-overzicht — geen strikte "vandaag"-datumgrens, zelfde
// schaal als de vorige mock-lijst.
export async function getRecentBookingsForBarber(
  supabase: SupabaseClient,
  barberId: string,
  limit = 10
): Promise<BookingRecord[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("barber_id", barberId)
    .neq("status", "requested")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as BookingRow[]).map(mapBooking);
}

// ============================================================
// Matching (Fase 5)
// ============================================================

// Roept de server-side geocode Route Handler aan (nooit rechtstreeks
// Nominatim vanuit de client, zie src/app/api/geocode/route.ts).
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: number; lng: number };
    return { lat: data.lat, lng: data.lng };
  } catch {
    return null;
  }
}

// Slaat de gegeocodeerde locatie van een barber op (aangeroepen vanuit
// /barber/werkgebied bij het opslaan van de stad).
export async function setBarberLocation(
  supabase: SupabaseClient,
  barberId: string,
  lat: number,
  lng: number
): Promise<boolean> {
  const { error } = await supabase.from("barber_profiles").update({ lat, lng }).eq("id", barberId);
  return !error;
}

export async function setBarberOnline(
  supabase: SupabaseClient,
  barberId: string,
  online: boolean
): Promise<boolean> {
  const { error } = await supabase.from("barber_profiles").update({ is_online: online }).eq("id", barberId);
  return !error;
}

// Heartbeat, zie 0037 — puur "de barber-app was hier onlangs open",
// losstaand van de handmatige is_online-schakelaar hierboven.
export async function updateBarberLastActive(supabase: SupabaseClient, barberId: string): Promise<void> {
  await supabase.from("barber_profiles").update({ last_active_at: new Date().toISOString() }).eq("id", barberId);
}

interface NearestBarberRow {
  barber_id: string;
  distance_km: number;
  services: { id: string; name: string; priceCents: number; durationMinutes: number }[];
}

// Roept find_nearest_eligible_barber() aan (0007, multi-service sinds
// 0027) — geeft nooit naam/coördinaten van de barber terug, alleen wat
// nodig is voor een prijsindicatie. Een barber matcht alleen als hij
// ALLE gevraagde servicenamen aanbiedt.
export async function findNearestEligibleBarber(
  supabase: SupabaseClient,
  serviceNames: string[],
  lat: number,
  lng: number
): Promise<NearestBarberMatch | null> {
  const { data, error } = await supabase.rpc("find_nearest_eligible_barber", {
    p_service_names: serviceNames,
    p_lat: lat,
    p_lng: lng,
  });
  if (error || !data || data.length === 0) return null;
  const row = data[0] as NearestBarberRow;
  return {
    barberId: row.barber_id,
    distanceKm: row.distance_km,
    services: row.services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents, durationMinutes: s.durationMinutes })),
  };
}

// Eerste openstaande, automatisch-toegewezen aanvraag die deze barber mag
// zien — RLS (0007) filtert al op straal/dienst/beschikbaarheid, dus geen
// barberId-parameter nodig.
export async function getOpenBroadcastRequestForBarber(
  supabase: SupabaseClient
): Promise<BookingRecord | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .is("barber_id", null)
    .eq("status", "requested")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapBooking(data as unknown as BookingRow);
}

// Atomische claim: slaagt alleen als de aanvraag nog niet door een andere
// barber is gepakt (WHERE barber_id is null and status='requested' —
// gecombineerd met RLS uit 0007). 0 geraakte rijen = te laat.
export async function claimBooking(
  supabase: SupabaseClient,
  bookingId: string,
  barberId: string
): Promise<{ success: boolean; booking: BookingRecord | null }> {
  const { data, error } = await supabase
    .from("bookings")
    .update({ barber_id: barberId, status: "accepted" })
    .eq("id", bookingId)
    .is("barber_id", null)
    .eq("status", "requested")
    .select(BOOKING_COLUMNS)
    .maybeSingle();
  if (error || !data) return { success: false, booking: null };
  return { success: true, booking: mapBooking(data as unknown as BookingRow) };
}

// ============================================================
// Notificaties (Fase 5, uitgebreid Fase 8) — alleen select/mark-as-read;
// rijen ontstaan via triggers (0007/0013), niet via de client.
// getNotificationsForUser filtert puur op user_id, dus bruikbaar voor
// zowel klant als barber (sinds Fase 8 heeft de barber ook een eigen
// notificatiescherm).
// ============================================================

interface NotificationRow {
  id: string;
  type: AppNotification["type"];
  title: string;
  body: string | null;
  related_booking_id: string | null;
  read: boolean;
  created_at: string;
}

export async function getNotificationsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, related_booking_id, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedBookingId: row.related_booking_id,
    read: row.read,
    createdAt: row.created_at,
  }));
}

// Voor het rode bolletje op de bel-knop op /klant/home en /barber/
// dashboard — head-only count-query (geen rijen ophalen) zodat dit
// goedkoop genoeg is om op elke pagina-load (en bij de barber: elke
// poll-tick) te checken.
export async function hasUnreadNotifications(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<boolean> {
  const { error } = await supabase.from("notifications").update({ read: true }).eq("id", notificationId);
  return !error;
}

// Klant mag een geschil openen op de eigen boeking — RLS (0009) staat dit
// alleen toe binnen 24 uur na completed, dus een poging daarbuiten faalt
// hier gewoon stil (ok: false), ongeacht wat de UI al toestond te tonen.
export async function openDispute(
  supabase: SupabaseClient,
  bookingId: string,
  openedBy: string,
  reason: string
): Promise<boolean> {
  const { error } = await supabase.from("disputes").insert({
    booking_id: bookingId,
    opened_by: openedBy,
    reason,
  });
  return !error;
}

// ============================================================
// Betalingen (Fase 6) — payments heeft geen client-schrijfrecht, alleen
// select (RLS: "Participants can view own payment"). Rijen ontstaan
// uitsluitend via /api/stripe/webhook, escrow_state wijzigt alleen via
// /api/stripe/cancel-and-refund of /api/cron/release-escrow.
// ============================================================

interface PaymentRow {
  id: string;
  booking_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  barber_payout_cents: number;
  escrow_state: PaymentRecord["escrowState"];
  held_at: string;
  released_at: string | null;
  paid_out_at: string | null;
}

const PAYMENT_COLUMNS =
  "id, booking_id, amount_cents, platform_fee_cents, barber_payout_cents, escrow_state, held_at, released_at, paid_out_at";

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    bookingId: row.booking_id,
    amountCents: row.amount_cents,
    platformFeeCents: row.platform_fee_cents,
    barberPayoutCents: row.barber_payout_cents,
    escrowState: row.escrow_state,
    heldAt: row.held_at,
    releasedAt: row.released_at,
    paidOutAt: row.paid_out_at,
  };
}

// Gebruikt door /klant/succes om te pollen tot de webhook de rij heeft
// aangemaakt (client-side "succes" alleen is geen bewijs van betaling).
export async function getPayment(
  supabase: SupabaseClient,
  bookingId: string
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return mapPayment(data as unknown as PaymentRow);
}

export interface BarberPaymentRow {
  paymentId: string;
  bookingId: string;
  serviceName: string;
  createdAt: string;
  durationMinutes: number;
  amountCents: number;
  barberPayoutCents: number;
  escrowState: PaymentRecord["escrowState"];
  heldAt: string;
  releasedAt: string | null;
}

interface BookingWithPaymentRow {
  id: string;
  service_name_snapshot: string;
  duration_minutes_snapshot: number;
  created_at: string;
  payments: PaymentRow[] | PaymentRow | null;
}

// Voor /barber/uitbetalingen en /barber/verdiensten — eigen boekingen met
// hun (altijd precies 1) payments-rij, nieuwste eerst.
export async function getPaymentsForBarber(
  supabase: SupabaseClient,
  barberId: string
): Promise<BarberPaymentRow[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, service_name_snapshot, duration_minutes_snapshot, created_at, payments(id, amount_cents, barber_payout_cents, escrow_state, held_at, released_at)"
    )
    .eq("barber_id", barberId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as unknown as BookingWithPaymentRow[])
    .map((row) => {
      const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;
      if (!payment) return null;
      return {
        paymentId: payment.id,
        bookingId: row.id,
        serviceName: row.service_name_snapshot,
        createdAt: row.created_at,
        durationMinutes: row.duration_minutes_snapshot,
        amountCents: payment.amount_cents,
        barberPayoutCents: payment.barber_payout_cents,
        escrowState: payment.escrow_state,
        heldAt: payment.held_at,
        releasedAt: payment.released_at,
      };
    })
    .filter((row): row is BarberPaymentRow => row !== null);
}

// ============================================================
// Reviews (Fase 7)
// ============================================================

export async function createReview(
  supabase: SupabaseClient,
  input: { bookingId: string; customerId: string; barberId: string; stars: number; text: string | null }
): Promise<boolean> {
  const { error } = await supabase.from("reviews").insert({
    booking_id: input.bookingId,
    customer_id: input.customerId,
    barber_id: input.barberId,
    stars: input.stars,
    text: input.text,
  });
  return !error;
}

// Voor de "al beoordeeld"-check op /klant/review en /klant/status.
export async function getReviewForBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string };
}

interface BarberReviewRow {
  id: string;
  stars: number;
  text: string | null;
  created_at: string;
  reviewer_name: string;
}

// Roept get_barber_reviews() aan (0012) — geeft de reviewer-naam mee
// zonder profiles-RLS te verruimen, zie migratie-comment.
export async function getReviewsForBarber(
  supabase: SupabaseClient,
  barberId: string
): Promise<ReviewRecord[]> {
  const { data, error } = await supabase.rpc("get_barber_reviews", { p_barber_id: barberId });
  if (error || !data) return [];
  return (data as BarberReviewRow[]).map((row) => ({
    id: row.id,
    stars: row.stars,
    text: row.text,
    createdAt: row.created_at,
    reviewerName: row.reviewer_name,
  }));
}

// ============================================================
// Wallet, loyaliteit, referral, kortingscodes (Fase 9). wallets/
// wallet_ledger_entries/loyalty_ledger_entries hebben geen client-
// schrijfrecht (zie 0014) — alle mutaties lopen via RPC-functies
// (credit_wallet e.d.), hier alleen select-helpers + de RPC-wrappers.
// ============================================================

interface WalletRow {
  id: string;
  balance_cents: number;
  loyalty_points: number;
  updated_at: string;
}

export async function getWallet(supabase: SupabaseClient, userId: string): Promise<WalletRecord | null> {
  const { data, error } = await supabase
    .from("wallets")
    .select("id, balance_cents, loyalty_points, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as WalletRow;
  return {
    id: row.id,
    balanceCents: row.balance_cents,
    loyaltyPoints: row.loyalty_points,
    updatedAt: row.updated_at,
  };
}

interface WalletLedgerRow {
  id: string;
  entry_type: WalletLedgerEntry["entryType"];
  amount_cents: number;
  balance_after_cents: number;
  note: string | null;
  created_at: string;
}

export async function getWalletLedger(supabase: SupabaseClient, userId: string): Promise<WalletLedgerEntry[]> {
  const { data, error } = await supabase
    .from("wallet_ledger_entries")
    .select("id, entry_type, amount_cents, balance_after_cents, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as WalletLedgerRow[]).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    amountCents: row.amount_cents,
    balanceAfterCents: row.balance_after_cents,
    note: row.note,
    createdAt: row.created_at,
  }));
}

interface LoyaltyLedgerRow {
  id: string;
  entry_type: LoyaltyLedgerEntry["entryType"];
  points: number;
  points_balance_after: number;
  related_booking_id: string | null;
  created_at: string;
}

export async function getLoyaltyLedger(supabase: SupabaseClient, userId: string): Promise<LoyaltyLedgerEntry[]> {
  const { data, error } = await supabase
    .from("loyalty_ledger_entries")
    .select("id, entry_type, points, points_balance_after, related_booking_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as LoyaltyLedgerRow[]).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    points: row.points,
    pointsBalanceAfter: row.points_balance_after,
    relatedBookingId: row.related_booking_id,
    createdAt: row.created_at,
  }));
}

interface WalletTopupRow {
  id: string;
  amount_cents: number;
  bonus_cents: number;
  status: WalletTopup["status"];
  created_at: string;
  succeeded_at: string | null;
}

export async function getWalletTopups(supabase: SupabaseClient, userId: string): Promise<WalletTopup[]> {
  const { data, error } = await supabase
    .from("wallet_topups")
    .select("id, amount_cents, bonus_cents, status, created_at, succeeded_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as WalletTopupRow[]).map((row) => ({
    id: row.id,
    amountCents: row.amount_cents,
    bonusCents: row.bonus_cents,
    status: row.status,
    createdAt: row.created_at,
    succeededAt: row.succeeded_at,
  }));
}

// Gebruikt door /klant/wallet/opwaarderen/succes om te pollen tot de
// webhook process_wallet_topup heeft aangeroepen (zelfde patroon als
// getPayment voor /klant/succes).
export async function getWalletTopup(supabase: SupabaseClient, topupId: string): Promise<WalletTopup | null> {
  const { data, error } = await supabase
    .from("wallet_topups")
    .select("id, amount_cents, bonus_cents, status, created_at, succeeded_at")
    .eq("id", topupId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as WalletTopupRow;
  return {
    id: row.id,
    amountCents: row.amount_cents,
    bonusCents: row.bonus_cents,
    status: row.status,
    createdAt: row.created_at,
    succeededAt: row.succeeded_at,
  };
}

export async function redeemLoyaltyPoints(
  supabase: SupabaseClient,
  points: number
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await supabase.rpc("redeem_loyalty_points", { p_points: points });
  return { ok: !error, error: error?.message ?? null };
}

export async function previewDiscountCode(
  supabase: SupabaseClient,
  code: string
): Promise<DiscountPreview | null> {
  const { data, error } = await supabase.rpc("preview_discount_code", { p_code: code });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return { discountType: row.discount_type, value: row.value };
}

export async function getMyReferralStats(supabase: SupabaseClient): Promise<ReferralStats | null> {
  const { data, error } = await supabase.rpc("get_my_referral_stats");
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    referralCode: row.referral_code,
    referredCount: row.referred_count,
    totalBonusCents: row.total_bonus_cents,
  };
}

// ============================================================
// Admin (Fase 10). Deze helpers worden altijd met de service-role
// client aangeroepen (server components in src/app/admin/*, na een
// geslaagde requireAdmin()-check in de /api/admin/*-routes) — RLS is
// hier dus nooit de bron van waarheid, de helpers zelf bepalen de scope.
// ============================================================

export interface AdminStats {
  totalBookings: number;
  totalRevenueCents: number;
  activeBarbers: number;
  pendingApprovals: number;
  openDisputes: number;
}

export async function getAdminStats(supabase: SupabaseClient): Promise<AdminStats> {
  const [bookings, payments, activeBarbers, pendingApprovals, openDisputes] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }),
    supabase.from("payments").select("amount_cents, barber_payout_cents, escrow_state"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "barber").eq("barber_status", "approved"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "barber").eq("barber_status", "pending"),
    supabase.from("disputes").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);

  // Vroeger puur platform_fee_cents (alleen de klant-kant-opslag) — miste
  // de helft van de echte marge: de barber ontvangt ook 15% minder dan de
  // dienstprijs (barber_payout_cents), en dat verschil (amount_cents -
  // barber_payout_cents) blijft óók bij het platform, alleen stond het
  // nergens los geboekt. Een volledig terugbetaalde boeking (escrow_state
  // 'refunded') telt niet mee — amount_cents blijft daar bewust op het
  // oorspronkelijke bedrag staan (voor de betalingen-lijst, zie
  // admin/betalingen), maar er is dan feitelijk niets overgebleven om als
  // omzet te tellen.
  const totalRevenueCents = (payments.data ?? []).reduce((sum, p) => {
    if (p.escrow_state === "refunded") return sum;
    return sum + (p.amount_cents - p.barber_payout_cents);
  }, 0);

  return {
    totalBookings: bookings.count ?? 0,
    totalRevenueCents,
    activeBarbers: activeBarbers.count ?? 0,
    pendingApprovals: pendingApprovals.count ?? 0,
    openDisputes: openDisputes.count ?? 0,
  };
}

export interface AdminBarberRow {
  id: string;
  fullName: string;
  email: string;
  barberStatus: BarberStatus | null;
  createdAt: string;
  kvkNumber: string | null;
  city: string | null;
  portfolioUrls: string[];
  insuranceDocUrl: string | null;
  idDocUrl: string | null;
  diplomaUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
}

export async function getBarbersForAdmin(
  supabase: SupabaseClient,
  statusFilter?: BarberStatus
): Promise<AdminBarberRow[]> {
  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, email, barber_status, created_at, barber_profiles(kvk_number, city, portfolio_urls, insurance_doc_url, id_doc_url, diploma_url, rating_avg, rating_count)"
    )
    .eq("role", "barber")
    .order("created_at", { ascending: false });
  if (statusFilter) query = query.eq("barber_status", statusFilter);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    full_name: string;
    email: string;
    barber_status: BarberStatus | null;
    created_at: string;
    barber_profiles: {
      kvk_number: string | null;
      city: string | null;
      portfolio_urls: string[] | null;
      insurance_doc_url: string | null;
      id_doc_url: string | null;
      diploma_url: string | null;
      rating_avg: number | null;
      rating_count: number;
    } | null;
  }>).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    barberStatus: row.barber_status,
    createdAt: row.created_at,
    kvkNumber: row.barber_profiles?.kvk_number ?? null,
    city: row.barber_profiles?.city ?? null,
    portfolioUrls: row.barber_profiles?.portfolio_urls ?? [],
    insuranceDocUrl: row.barber_profiles?.insurance_doc_url ?? null,
    idDocUrl: row.barber_profiles?.id_doc_url ?? null,
    diplomaUrl: row.barber_profiles?.diploma_url ?? null,
    ratingAvg: row.barber_profiles?.rating_avg ?? null,
    ratingCount: row.barber_profiles?.rating_count ?? 0,
  }));
}

export interface AdminDisputeServiceLine {
  id: string;
  serviceName: string;
  quantity: number;
  unitPriceCents: number;
}

export interface AdminDisputeRow {
  id: string;
  bookingId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  resolutionNotes: string | null;
  openedAt: string;
  resolvedAt: string | null;
  serviceName: string;
  customerName: string;
  barberName: string;
  escrowState: EscrowState | null;
  stripePaymentIntentId: string | null;
  priceCents: number;
  lines: AdminDisputeServiceLine[];
}

export async function getDisputesForAdmin(supabase: SupabaseClient): Promise<AdminDisputeRow[]> {
  const { data: disputes, error } = await supabase
    .from("disputes")
    .select("id, booking_id, reason, status, resolution_notes, opened_at, resolved_at")
    .order("opened_at", { ascending: false });
  if (error || !disputes || disputes.length === 0) return [];

  const bookingIds = disputes.map((d) => d.booking_id);
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, service_name_snapshot, customer_id, barber_id, price_cents_snapshot")
    .in("id", bookingIds);

  const profileIds = Array.from(
    new Set((bookings ?? []).flatMap((b) => [b.customer_id, b.barber_id]).filter((id): id is string => !!id))
  );
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const { data: payments } = await supabase
    .from("payments")
    .select("booking_id, escrow_state, stripe_payment_intent_id")
    .in("booking_id", bookingIds);
  const paymentByBooking = new Map((payments ?? []).map((p) => [p.booking_id, p]));

  const { data: lineRows } = await supabase
    .from("booking_services")
    .select("id, booking_id, service_name_snapshot, quantity, unit_price_cents_snapshot")
    .in("booking_id", bookingIds);
  const linesByBooking = new Map<string, AdminDisputeServiceLine[]>();
  for (const l of lineRows ?? []) {
    const arr = linesByBooking.get(l.booking_id as string) ?? [];
    arr.push({
      id: l.id as string,
      serviceName: l.service_name_snapshot as string,
      quantity: l.quantity as number,
      unitPriceCents: l.unit_price_cents_snapshot as number,
    });
    linesByBooking.set(l.booking_id as string, arr);
  }

  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  return disputes.map((d) => {
    const booking = bookingById.get(d.booking_id);
    const payment = paymentByBooking.get(d.booking_id);
    return {
      id: d.id,
      bookingId: d.booking_id,
      reason: d.reason,
      status: d.status,
      resolutionNotes: d.resolution_notes,
      openedAt: d.opened_at,
      resolvedAt: d.resolved_at,
      serviceName: booking?.service_name_snapshot ?? "Onbekende dienst",
      customerName: (booking && nameById.get(booking.customer_id)) || "Onbekend",
      barberName: (booking?.barber_id && nameById.get(booking.barber_id)) || "Onbekend",
      escrowState: payment?.escrow_state ?? null,
      stripePaymentIntentId: payment?.stripe_payment_intent_id ?? null,
      priceCents: booking?.price_cents_snapshot ?? 0,
      lines: linesByBooking.get(d.booking_id) ?? [],
    };
  });
}

export interface AdminStuckBookingRow {
  id: string;
  status: BookingStatus;
  serviceName: string;
  customerName: string;
  barberName: string;
  updatedAt: string;
  escrowState: EscrowState | null;
}

// "Vastgelopen" boekingen (pre-launch audit): arrived/in_progress kent
// geen enkele annuleer-/geschilweg voor klant of barber — als de barber
// bv. z'n telefoon verliest na "Ik ben er", blijft de boeking (en het
// escrowbedrag) anders voor altijd hangen. Dit is de enige plek in de
// app die dat nog kan herstellen, zie /api/admin/bookings/force-resolve.
export async function getStuckBookingsForAdmin(supabase: SupabaseClient): Promise<AdminStuckBookingRow[]> {
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, status, service_name_snapshot, customer_id, barber_id, updated_at")
    .in("status", ["arrived", "in_progress"])
    .order("updated_at", { ascending: true });
  if (error || !bookings || bookings.length === 0) return [];

  const profileIds = Array.from(
    new Set(bookings.flatMap((b) => [b.customer_id, b.barber_id]).filter((id): id is string => !!id))
  );
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", profileIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const bookingIds = bookings.map((b) => b.id);
  const { data: payments } = await supabase
    .from("payments")
    .select("booking_id, escrow_state")
    .in("booking_id", bookingIds);
  const escrowByBooking = new Map((payments ?? []).map((p) => [p.booking_id, p.escrow_state]));

  return bookings.map((b) => ({
    id: b.id,
    status: b.status,
    serviceName: b.service_name_snapshot,
    customerName: nameById.get(b.customer_id) || "Onbekend",
    barberName: (b.barber_id && nameById.get(b.barber_id)) || "Onbekend",
    updatedAt: b.updated_at,
    escrowState: escrowByBooking.get(b.id) ?? null,
  }));
}

export interface AdminPaymentRow {
  id: string;
  bookingId: string;
  serviceName: string;
  amountCents: number;
  platformFeeCents: number;
  barberPayoutCents: number;
  discountCents: number;
  escrowState: EscrowState;
  heldAt: string;
  releasedAt: string | null;
}

export async function getPaymentsForAdmin(
  supabase: SupabaseClient,
  escrowStateFilter?: EscrowState
): Promise<AdminPaymentRow[]> {
  let query = supabase
    .from("payments")
    .select(
      "id, booking_id, amount_cents, platform_fee_cents, barber_payout_cents, discount_cents, escrow_state, held_at, released_at, bookings(service_name_snapshot)"
    )
    .order("held_at", { ascending: false });
  if (escrowStateFilter) query = query.eq("escrow_state", escrowStateFilter);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    booking_id: string;
    amount_cents: number;
    platform_fee_cents: number;
    barber_payout_cents: number;
    discount_cents: number;
    escrow_state: EscrowState;
    held_at: string;
    released_at: string | null;
    bookings: { service_name_snapshot: string } | null;
  }>).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    serviceName: row.bookings?.service_name_snapshot ?? "Onbekende dienst",
    amountCents: row.amount_cents,
    platformFeeCents: row.platform_fee_cents,
    barberPayoutCents: row.barber_payout_cents,
    discountCents: row.discount_cents,
    escrowState: row.escrow_state,
    heldAt: row.held_at,
    releasedAt: row.released_at,
  }));
}

export interface AdminReviewRow {
  id: string;
  stars: number;
  text: string | null;
  createdAt: string;
  customerName: string;
  barberName: string;
}

export async function getReviewsForAdmin(supabase: SupabaseClient): Promise<AdminReviewRow[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      "id, stars, text, created_at, customer:profiles!reviews_customer_id_fkey(full_name), barber:profiles!reviews_barber_id_fkey(full_name)"
    )
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    stars: number;
    text: string | null;
    created_at: string;
    customer: { full_name: string } | null;
    barber: { full_name: string } | null;
  }>).map((row) => ({
    id: row.id,
    stars: row.stars,
    text: row.text,
    createdAt: row.created_at,
    customerName: row.customer?.full_name ?? "Onbekend",
    barberName: row.barber?.full_name ?? "Onbekend",
  }));
}

export interface AdminDiscountCodeRow {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  value: number;
  maxUses: number | null;
  usesCount: number;
  validFrom: string;
  validUntil: string | null;
  active: boolean;
  createdAt: string;
}

export async function getDiscountCodesForAdmin(supabase: SupabaseClient): Promise<AdminDiscountCodeRow[]> {
  const { data, error } = await supabase
    .from("discount_codes")
    .select("id, code, discount_type, value, max_uses, uses_count, valid_from, valid_until, active, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    value: row.value,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    active: row.active,
    createdAt: row.created_at,
  }));
}

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  barberStatus: BarberStatus | null;
  suspended: boolean;
  createdAt: string;
}

export async function getUsersForAdmin(supabase: SupabaseClient, search?: string): Promise<AdminUserRow[]> {
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, role, barber_status, suspended, created_at")
    .order("created_at", { ascending: false });
  if (search) query = query.ilike("full_name", `%${search}%`);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    barberStatus: row.barber_status,
    suspended: row.suspended,
    createdAt: row.created_at,
  }));
}

export interface AdminLogEntry {
  id: string;
  adminName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

export async function getAdminActionLog(supabase: SupabaseClient): Promise<AdminLogEntry[]> {
  const { data, error } = await supabase
    .from("admin_action_log")
    .select("id, action, target_type, target_id, detail, created_at, admin_users(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    detail: string | null;
    created_at: string;
    admin_users: { full_name: string } | null;
  }>).map((row) => ({
    id: row.id,
    adminName: row.admin_users?.full_name ?? "Onbekend",
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

export interface AdminNoShowRow {
  id: string;
  barberId: string;
  barberName: string;
  barberStatus: BarberStatus | null;
  bookingId: string;
  customerName: string;
  serviceName: string;
  scheduledAt: string | null;
  createdAt: string;
  // Volgnummer van deze waarschuwing voor déze barber (chronologisch,
  // 1e/2e/...) — bij 2 wordt de barber automatisch geschorst, zie
  // /api/cron/expire-noshow-bookings.
  warningNumber: number;
}

// Voor het admin-overzicht van gemiste geplande afspraken (0035) — elke
// rij in barber_no_show_warnings is één automatische annulering omdat de
// barber niet op tijd bevestigde onderweg te zijn.
export async function getNoShowWarningsForAdmin(supabase: SupabaseClient): Promise<AdminNoShowRow[]> {
  const { data: warnings, error } = await supabase
    .from("barber_no_show_warnings")
    .select("id, barber_id, booking_id, created_at")
    .order("created_at", { ascending: false });
  if (error || !warnings || warnings.length === 0) return [];

  const bookingIds = warnings.map((w) => w.booking_id);
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, customer_id, service_name_snapshot, scheduled_at")
    .in("id", bookingIds);
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  const profileIds = Array.from(
    new Set([...warnings.map((w) => w.barber_id), ...(bookings ?? []).map((b) => b.customer_id)])
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, barber_status")
    .in("id", profileIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const barberStatusById = new Map((profiles ?? []).map((p) => [p.id, p.barber_status as BarberStatus | null]));

  // Volgnummer per barber chronologisch (oud->nieuw) bepalen, los van de
  // weergavevolgorde hierboven (nieuw->oud).
  const countByBarber = new Map<string, number>();
  const numberByWarningId = new Map<string, number>();
  for (const w of [...warnings].reverse()) {
    const n = (countByBarber.get(w.barber_id) ?? 0) + 1;
    countByBarber.set(w.barber_id, n);
    numberByWarningId.set(w.id, n);
  }

  return warnings.map((w) => {
    const booking = bookingById.get(w.booking_id);
    return {
      id: w.id,
      barberId: w.barber_id,
      barberName: nameById.get(w.barber_id) ?? "Onbekend",
      barberStatus: barberStatusById.get(w.barber_id) ?? null,
      bookingId: w.booking_id,
      customerName: booking ? (nameById.get(booking.customer_id) ?? "Onbekend") : "Onbekend",
      serviceName: booking?.service_name_snapshot ?? "Onbekend",
      scheduledAt: booking?.scheduled_at ?? null,
      createdAt: w.created_at,
      warningNumber: numberByWarningId.get(w.id) ?? 1,
    };
  });
}
