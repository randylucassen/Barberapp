"use client";
import { AlertCircle, Clock, CreditCard, MapPin, Phone, Scissors, Star, ChevronRight, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button, Card, Dialog, IconButton, Input, NavBar } from "@/components/ui";
import { AddressAutocomplete, Avatar, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  createBookingWithServices,
  findNearestEligibleBarber,
  geocodeAddress,
  getCustomerProfile,
  type BookingServiceLineInput,
} from "@/lib/supabase/queries";

interface BarberInfo {
  fullName: string;
  ratingAvg: number | null;
  ratingCount: number;
}

interface DisplayLine {
  serviceId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  unitDurationMinutes: number;
}

interface WantedService {
  name: string;
  quantity: number;
}

function BookingContent() {
  const router = useRouter();
  const search = useSearchParams();
  const barberId = search.get("barberId");
  const auto = search.get("auto") === "1";
  const asapParam = search.get("asap") !== "0";

  // Direct: "lines" = [{serviceId, quantity}] (al gekoppeld aan een
  // specifieke barber's diensten, via /klant/barbers of "Opnieuw").
  // Auto: "services" = [{name, quantity}] (nog geen specifieke barber —
  // matcht pas bij het bevestigen, zie handleStartConfirm).
  const requestedLines: BookingServiceLineInput[] = (() => {
    try {
      const raw = search.get("lines");
      return raw ? (JSON.parse(raw) as BookingServiceLineInput[]) : [];
    } catch {
      return [];
    }
  })();
  const wantedServices: WantedService[] = (() => {
    try {
      const raw = search.get("services");
      return raw ? (JSON.parse(raw) as WantedService[]) : [];
    } catch {
      return [];
    }
  })();

  const [userId, setUserId] = useState<string | null>(null);
  const [barber, setBarber] = useState<BarberInfo | null>(null);
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const [resolvedBarberId, setResolvedBarberId] = useState<string | null>(null);
  const [address, setAddress] = useState(search.get("address") ?? "");
  const [asap, setAsap] = useState(asapParam);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [dlg, setDlg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [matchedGeo, setMatchedGeo] = useState<{ lat: number; lng: number } | null>(null);
  // null = nog niet bekend/niet van toepassing (auto-mode matcht toch al
  // alleen beschikbare barbers), false = de gekozen barber is nu offline
  // of al bezet met een andere rit. Klant kon dit voorheen nergens zien —
  // niet bij een directe keuze via /klant/barbers (die scherm toont het
  // wél, maar "Opnieuw" vanuit Recent slaat dat scherm over) en niet meer
  // hier. We blokkeren het versturen niet (barber kan binnen het
  // 30-min-venster alsnog online komen), maar tonen het wel duidelijk.
  const [barberAvailable, setBarberAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (auto && wantedServices.length === 0) {
      router.replace("/klant/barbers");
      return;
    }
    if (!auto && (!barberId || requestedLines.length === 0)) {
      router.replace("/klant/barbers");
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        setUserId(authData.user.id);
        if (!address) {
          const customerProfile = await getCustomerProfile(supabase, authData.user.id);
          if (customerProfile?.defaultAddress) setAddress(customerProfile.defaultAddress);
        }
      }

      if (auto) return;

      const { data: barberRow } = await supabase
        .from("approved_barbers")
        .select("full_name, rating_avg, rating_count")
        .eq("id", barberId)
        .single();
      if (barberRow) {
        setBarber({ fullName: barberRow.full_name, ratingAvg: barberRow.rating_avg, ratingCount: barberRow.rating_count });
      }

      const { data: available } = await supabase.rpc("barber_is_online_and_available", { p_barber_id: barberId });
      setBarberAvailable(available ?? false);

      const { data: serviceRows } = await supabase
        .from("services")
        .select("id, name, price_cents, duration_minutes")
        .in(
          "id",
          requestedLines.map((l) => l.serviceId)
        );
      const byId = new Map((serviceRows ?? []).map((s) => [s.id as string, s]));
      setLines(
        requestedLines
          .map((l) => {
            const s = byId.get(l.serviceId);
            if (!s) return null;
            return {
              serviceId: l.serviceId,
              name: s.name as string,
              quantity: l.quantity,
              unitPriceCents: s.price_cents as number,
              unitDurationMinutes: s.duration_minutes as number,
            };
          })
          .filter((l): l is DisplayLine => l !== null)
      );
      setResolvedBarberId(barberId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId, auto, search.get("lines"), search.get("services")]);

  // Losse, herhalende check (i.p.v. één keer bij het laden) — de eenmalige
  // versie hierboven kon een gedateerde "niet online"-melding tonen als de
  // barber ná het laden van dit scherm alsnog online kwam; de klant zag dan
  // ten onrechte de waarschuwing terwijl boeken allang weer gewoon zou
  // lukken, zonder dat er iets was om dat te corrigeren.
  useEffect(() => {
    if (auto || !barberId) return;
    const supabase = createClient();
    let cancelled = false;
    async function check() {
      const { data: available } = await supabase.rpc("barber_is_online_and_available", { p_barber_id: barberId });
      if (!cancelled) setBarberAvailable(available ?? false);
    }
    const interval = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [barberId, auto]);

  async function handleStartConfirm() {
    if (!auto) {
      setDlg(true);
      return;
    }
    if (wantedServices.length === 0 || !address) return;
    setMatching(true);
    setMatchError(null);
    const geo = await geocodeAddress(address);
    if (!geo) {
      setMatching(false);
      setMatchError("Kon je adres niet automatisch lokaliseren. Controleer het adres en probeer opnieuw.");
      return;
    }
    const match = await findNearestEligibleBarber(
      createClient(),
      wantedServices.map((w) => w.name),
      geo.lat,
      geo.lng
    );
    setMatching(false);
    if (!match) {
      router.push("/klant/fout/nobarbers");
      return;
    }
    const byName = new Map(match.services.map((s) => [s.name, s]));
    setLines(
      wantedServices
        .map((w) => {
          const s = byName.get(w.name);
          if (!s) return null;
          return {
            serviceId: s.id,
            name: s.name,
            quantity: w.quantity,
            unitPriceCents: s.priceCents,
            unitDurationMinutes: s.durationMinutes,
          };
        })
        .filter((l): l is DisplayLine => l !== null)
    );
    setMatchedGeo(geo);
    setDlg(true);
  }

  async function handleConfirm() {
    if (!userId || lines.length === 0) return;
    if (!auto && !resolvedBarberId) return;
    setSubmitting(true);
    setBookingError(null);
    const client = createClient();

    let scheduledAt: string | null = null;
    if (!asap && date && time) {
      scheduledAt = new Date(`${date}T${time}`).toISOString();
    }

    const { booking, errorMessage } = await createBookingWithServices(client, {
      barberId: auto ? null : resolvedBarberId,
      lines: lines.map((l) => ({ serviceId: l.serviceId, quantity: l.quantity })),
      address: address || "Onbekend adres",
      note: note || null,
      requestedAsap: asap,
      scheduledAt,
      ...(auto && matchedGeo ? { lat: matchedGeo.lat, lng: matchedGeo.lng } : {}),
    });

    setSubmitting(false);
    if (booking) {
      setDlg(false);
      router.push(`/klant/betaling?bookingId=${booking.id}`);
    } else {
      setBookingError(errorMessage || "Aanvraag versturen is niet gelukt. Probeer het nog eens.");
    }
  }

  const hasLines = lines.length > 0;
  const totalPriceCents = hasLines ? lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0) : null;
  const totalDurationMinutes = hasLines ? lines.reduce((sum, l) => sum + l.unitDurationMinutes * l.quantity, 0) : null;
  const priceLabel = totalPriceCents !== null ? (totalPriceCents / 100).toFixed(2).replace(".", ",") : "–";

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Jouw aanvraag" onBack={() => router.push("/klant/barbers")} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        {auto ? (
          <Card variant="outline" padding={16}>
            <div className="flex gap-3.5 items-center">
              <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center text-accent shrink-0">
                <Zap size={22} fill="currentColor" />
              </div>
              <div className="flex-1">
                <div className="text-[16px] font-semibold">Automatisch toewijzen</div>
                <div className="text-[13px] text-text-secondary mt-0.5">De dichtstbijzijnde geschikte barber krijgt je aanvraag</div>
              </div>
            </div>
          </Card>
        ) : (
          <Card variant="outline" padding={16}>
            <div className="flex gap-3.5 items-center">
              <Avatar name={barber?.fullName ?? "…"} size={48} />
              <div className="flex-1">
                <div className="text-[16px] font-semibold">{barber?.fullName ?? "Barber laden…"}</div>
                <div className="flex items-center gap-1 text-[13px] text-text-secondary mt-0.5">
                  {barber?.ratingAvg ? (
                    <>
                      <span className="text-primary flex"><Star size={13} fill="currentColor" /></span>
                      <span className="font-semibold text-primary">{barber.ratingAvg}</span>
                      <span>({barber.ratingCount} boekingen)</span>
                    </>
                  ) : (
                    <span>Nieuw op Groomy</span>
                  )}
                </div>
              </div>
              <IconButton label="Bel" size={40}><Phone size={18} /></IconButton>
            </div>
          </Card>
        )}
        {!auto && barberAvailable === false && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px] flex gap-2.5 items-start">
            <span className="shrink-0 mt-0.5"><AlertCircle size={16} /></span>
            <span>
              Deze barber is nu niet online of al bezet met een andere rit. Je kan de aanvraag nog wel versturen — hij komt
              mogelijk binnen 30 minuten weer online — maar kies anders &ldquo;Automatisch toewijzen&rdquo; voor een barber die nu wel beschikbaar is.
            </span>
          </div>
        )}
        <div className="mt-5">
          {hasLines ? (
            lines.map((l) => (
              <Row
                key={l.serviceId}
                left={<span className="text-primary"><Scissors size={20} /></span>}
                title={l.quantity > 1 ? `${l.quantity}x ${l.name}` : l.name}
                sub={`${l.unitDurationMinutes * l.quantity} min`}
                right={<span className="font-semibold">€{((l.unitPriceCents * l.quantity) / 100).toFixed(2).replace(".", ",")}</span>}
              />
            ))
          ) : auto && wantedServices.length > 0 ? (
            // Nog geen prijs/duur bekend (dat vereist een matchende
            // barber, pas bekend na "Bevestig aanvraag") — toon in de
            // tussentijd wél alvast wat de klant heeft aangevinkt op
            // klant/home, i.p.v. een kaal "…" dat suggereert dat de
            // selectie niet is aangekomen.
            wantedServices.map((w) => (
              <Row
                key={w.name}
                left={<span className="text-primary"><Scissors size={20} /></span>}
                title={w.quantity > 1 ? `${w.quantity}x ${w.name}` : w.name}
                sub=""
                right={<span className="font-semibold">Bij matching</span>}
              />
            ))
          ) : (
            <Row
              left={<span className="text-primary"><Scissors size={20} /></span>}
              title="…"
              sub=""
              right={<span className="font-semibold">{auto ? "Bij matching" : "–"}</span>}
            />
          )}
          <div className="py-3 border-b border-border-soft flex items-center gap-3.5">
            <span className="text-primary"><MapPin size={20} /></span>
            <AddressAutocomplete
              value={address}
              onChange={setAddress}
              placeholder="Straat en huisnummer, plaats"
              className="flex-1"
              inputClassName="flex-1 min-w-0 bg-transparent border-none outline-none text-[15px] font-medium placeholder:text-text-tertiary placeholder:font-normal"
            />
          </div>
          <div className="py-3 border-b border-border-soft flex items-center gap-3.5">
            <span className="text-primary"><Clock size={20} /></span>
            <div className="flex-1">
              <div className="text-[15px] font-medium">{asap ? "Zo snel mogelijk" : "Ingepland"}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setAsap(!asap)}>
              {asap ? "Plan in" : "Nu"}
            </Button>
          </div>
          {!asap && (
            <div className="py-3 border-b border-border-soft flex gap-2.5">
              <Input type="date" label="Datum" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
              <Input type="time" label="Tijd" value={time} onChange={(e) => setTime(e.target.value)} className="flex-1" />
            </div>
          )}
          <Row left={<span className="text-primary"><CreditCard size={20} /></span>} title="iDEAL" sub="Betaal na afloop" right={<ChevronRight size={18} />} />
          <div className="pt-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opmerking voor je barber (optioneel)"
              rows={3}
              className="w-full bg-surface rounded-md px-4 py-3 text-[15px] placeholder:text-text-tertiary border-none outline-none resize-none"
            />
          </div>
        </div>
        {totalDurationMinutes !== null && (
          <div className="mt-2 text-[13px] text-text-secondary">Totale duur: {totalDurationMinutes} min</div>
        )}
        <div className="mt-2 text-[13px] text-text-secondary">Annuleren kan gratis tot 1 uur vooraf.</div>
        {matchError && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {matchError}
          </div>
        )}
      </div>
      <div className="px-5 pt-3 pb-2 border-t border-border bg-white">
        <div className="flex justify-between mb-3 text-[15px]">
          <span className="text-text-secondary">Totaal</span>
          <span className="font-bold text-[17px]">{hasLines ? `€${priceLabel}` : auto ? "Bij matching" : "–"}</span>
        </div>
        <Button
          full
          variant="accent"
          disabled={(auto ? !address : !hasLines || !address) || matching}
          onClick={handleStartConfirm}
        >
          {matching ? "Barber zoeken…" : "Bevestig aanvraag"}
        </Button>
      </div>
      <Dialog
        open={dlg}
        title="Aanvraag versturen?"
        onClose={() => setDlg(false)}
        actions={
          <>
            <Button full size="md" disabled={submitting} onClick={handleConfirm}>
              {submitting ? "Bezig…" : "Verstuur"}
            </Button>
            <Button full size="md" variant="ghost" onClick={() => setDlg(false)}>Terug</Button>
          </>
        }
      >
        {auto
          ? "De dichtstbijzijnde geschikte barber krijgt je aanvraag direct. Je betaling staat veilig vast tot na afloop."
          : `${barber?.fullName?.split(" ")[0] ?? "De barber"} krijgt je aanvraag direct. Je betaling staat veilig vast tot na afloop.`}
        {bookingError && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {bookingError}
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense>
      <BookingContent />
    </Suspense>
  );
}
