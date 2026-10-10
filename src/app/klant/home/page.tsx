"use client";
import { MapPin, ChevronRight, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Tag } from "@/components/ui";
import { AddressAutocomplete, Avatar, NotificationBell, Row } from "@/components/shared";
import { OnboardingTutorial, type TutorialStep } from "@/components/tutorial/OnboardingTutorial";
import { createClient } from "@/lib/supabase/client";
import {
  getActiveBookingForCustomer,
  getCompletedBookingBannerForCustomer,
  getCustomerProfile,
  getDisputeBannerForCustomer,
  getRecentCompletedBookingsForCustomer,
  getTutorialSeenAt,
  hasUnreadNotifications,
  type CustomerCompletedBookingBanner,
  type CustomerDisputeBanner,
  type RecentBookingSummary,
} from "@/lib/supabase/queries";
import type { BookingRecord, BookingStatus } from "@/lib/types";

// 6 stappen: welkom -> adres -> diensten -> boek direct -> wallet (via de
// Profiel-tab, die al op dit scherm staat — geen navigatie nodig) ->
// afronding. Zie de eerder goedgekeurde "KPPRTJE Rondleiding"-preview.
const KLANT_TUTORIAL_STEPS: TutorialStep[] = [
  { title: "Welkom bij KPPRTJE!", body: "In 6 korte stappen laten we zien hoe je in een paar tikken een barber boekt." },
  {
    targetId: "tut-k-address",
    title: "Vul je adres in",
    body: "Zo kunnen we een barber bij jou in de buurt vinden. Je kunt dit adres later altijd aanpassen.",
  },
  {
    targetId: "tut-k-tags",
    title: "Kies je dienst(en)",
    body: "Tik op een tegel om die te selecteren, tik nogmaals om het aantal te verhogen. Je kunt meerdere diensten combineren in één boeking.",
  },
  {
    targetId: "tut-k-book",
    title: "Boek direct",
    body: "Wij zoeken automatisch de snelste beschikbare barber voor je. Liever zelf kiezen? Dat kan ook, via de lijst met barbers in de buurt.",
  },
  {
    targetId: "tab-profiel",
    title: "Je wallet",
    body: "Via Profiel vind je je wallet: waardeer op met een bonus vanaf €50, verdien €5 per uitgenodigde vriend, en spaar bij elke afgeronde boeking 1 loyaliteitspunt per bestede euro — in te wisselen voor saldo.",
  },
  {
    title: "Klaar om te knippen!",
    body: "Dat was het — je kunt nu direct je eerste barber boeken. Deze rondleiding vind je terug via Profiel.",
  },
];

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} d geleden`;
  return `${Math.floor(days / 7)} weken geleden`;
}

// Namen matchen exact de standaarddiensten die een barber bij aanmelden
// aanmaakt (zie DEFAULT_SERVICES in barber/aanmelden) — anders vindt de
// exacte match in /klant/barbers geen resultaat en valt hij terug op de
// eerste dienst van de barber.
const SERVICE_TAGS = ["Knipbeurt", "Baard trimmen", "Knippen + baard", "Kids"];

function formatBookingDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

// "maak hier iets professioneels van" — geen letterlijke placeholder-
// tekst, maar een korte, geruststellende melding per fase. "open" toont
// geen "Oké!"-knop (de melding staat nog in behandeling, niet iets om
// weg te klikken); "resolved"/"dismissed" wel, zie DisputeBanner hieronder.
// Toont de datum van de boeking i.p.v. de dienstnaam (op verzoek van de
// gebruiker) — bij meerdere diensten in één boeking was "knipbeurt" toch
// al onvolledig/willekeurig.
const DISPUTE_BANNER_COPY: Record<CustomerDisputeBanner["status"], { title: string; body: (date: string) => string }> = {
  open: {
    title: "Je melding wordt bekeken",
    body: (date) => `We onderzoeken je melding over je boeking van ${date}. Je hoort van ons zodra er een update is.`,
  },
  resolved: {
    title: "Geschil afgehandeld",
    body: (date) =>
      `We hebben je melding over je boeking van ${date} beoordeeld en een terugbetaling verwerkt. Bekijk je e-mail voor de details.`,
  },
  dismissed: {
    title: "Geschil afgehandeld",
    body: (date) => `We hebben je melding over je boeking van ${date} beoordeeld. Bekijk je e-mail voor de uitkomst en meer informatie.`,
  },
};

const ACTIVE_STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Aangevraagd — wachten op een barber",
  price_pending: "Barber gevonden — bevestig de prijs",
  accepted: "Bevestigd",
  en_route: "Barber is onderweg",
  arrived: "Barber is aangekomen",
  in_progress: "Knipbeurt bezig",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};

export default function HomePage() {
  const router = useRouter();
  // Servicenaam -> aantal. Tikken op een tag verhoogt het aantal (1, 2,
  // 3… tot 6, dan weer weg) — zo kan een klant meerdere verschillende
  // diensten in één aanvraag combineren (bv. 2x Kids + 1x Knippen+baard),
  // met de gebruiker afgestemd i.p.v. een enkele radiogroup-selectie.
  const [selected, setSelected] = useState<Map<string, number>>(new Map([["Knipbeurt", 1]]));
  const [address, setAddress] = useState("");
  const [activeBooking, setActiveBooking] = useState<BookingRecord | null>(null);
  const [recentBookings, setRecentBookings] = useState<RecentBookingSummary[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [disputeBanner, setDisputeBanner] = useState<CustomerDisputeBanner | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [completedBanner, setCompletedBanner] = useState<CustomerCompletedBookingBanner | null>(null);
  const [tutorialUserId, setTutorialUserId] = useState<string | null>(null);
  const [tutorialSeenAt, setTutorialSeenAt] = useState<string | null>(null);
  const [tutorialChecked, setTutorialChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Ook de "Recent"-lijst hoort hierin — niet alleen de lopende
    // boeking — anders blijft een net afgeronde boeking onzichtbaar
    // totdat de pagina een echte volledige herlading krijgt.
    async function loadHomeData() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const active = await getActiveBookingForCustomer(supabase, data.user.id);
      setActiveBooking(active);
      const recent = await getRecentCompletedBookingsForCustomer(supabase, data.user.id);
      setRecentBookings(recent);
      setHasUnread(await hasUnreadNotifications(supabase, data.user.id));
      setDisputeBanner(await getDisputeBannerForCustomer(supabase, data.user.id));
      setCompletedBanner(await getCompletedBookingBannerForCustomer(supabase, data.user.id));
      // Hoort hier (niet in de losse mount-only IIFE hieronder) om
      // precies dezelfde reden als "Recent" hierboven: na "Rondleiding
      // opnieuw bekijken" (reset + router.push naar dit scherm) kan
      // Next.js' client-side router-cache de al bestaande component-
      // instantie hergebruiken i.p.v. een verse mount te doen — dan zou
      // een check die alleen in de mount-only IIFE staat de reset nooit
      // oppikken. loadHomeData() draait wél opnieuw via de drie
      // listeners hieronder.
      setTutorialUserId(data.user.id);
      setTutorialSeenAt(await getTutorialSeenAt(supabase, data.user.id));
      setTutorialChecked(true);
    }

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const customerProfile = await getCustomerProfile(supabase, data.user.id);
      if (customerProfile?.defaultAddress) setAddress(customerProfile.defaultAddress);
      await loadHomeData();
    })();

    // Drie losse mechanismes kunnen ervoor zorgen dat deze pagina zichtbaar
    // wordt zonder dat de component opnieuw mount (dus zonder dat de
    // useEffect hierboven opnieuw draait) — elk vereist zijn eigen listener:
    // 1. Mobiele bfcache-restore (vooral iOS Safari) → 'pageshow' met
    //    event.persisted.
    // 2. Next.js' eigen client-side router-cache: terugnavigeren naar een
    //    al eerder bezochte route binnen dezelfde sessie kan de gecachte
    //    component-instantie herstellen i.p.v. een verse mount te doen —
    //    geen 'pageshow'-event, wel gewoon een normale 'focus'.
    // 3. Terugkeren naar een al open tabblad (bv. na een tijdje weg).
    // Vandaar alle drie afgedekt i.p.v. alleen 'pageshow' (bleek in de
    // praktijk niet genoeg — "Recent" bleef alsnog verouderd).
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) loadHomeData();
    }
    function handleFocus() {
      loadHomeData();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") loadHomeData();
    }
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function toggleTag(tag: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      const current = next.get(tag) ?? 0;
      if (current >= 6) next.delete(tag);
      else next.set(tag, current + 1);
      return next;
    });
  }

  function resetSelection() {
    setSelected(new Map());
  }

  function bookService() {
    if (selected.size === 0) return;
    const services = Array.from(selected.entries()).map(([name, quantity]) => ({ name, quantity }));
    const params = new URLSearchParams({ services: JSON.stringify(services) });
    if (address) params.set("address", address);
    router.push(`/klant/barbers?${params.toString()}`);
  }

  async function acknowledgeDispute() {
    if (!disputeBanner) return;
    setAcknowledging(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("acknowledge_dispute", { p_dispute_id: disputeBanner.id });
    setAcknowledging(false);
    if (!error) setDisputeBanner(null);
  }

  function bookAgain(booking: RecentBookingSummary) {
    if (booking.lines.length === 0) return;
    const params = new URLSearchParams({
      barberId: booking.barberId,
      lines: JSON.stringify(booking.lines),
      asap: "1",
    });
    if (address) params.set("address", address);
    router.push(`/klant/boeking?${params.toString()}`);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-4 flex items-center justify-between">
        <span className="font-bold text-[22px] tracking-[-0.03em]">KPPRTJE!</span>
        <NotificationBell hasUnread={hasUnread} onClick={() => router.push("/klant/notificaties")} />
      </div>
      {disputeBanner && (
        <div className="px-5 pt-4">
          <div className="bg-accent-soft border border-accent/20 rounded-lg p-4">
            <div className="text-[14px] font-semibold text-text-primary">
              {DISPUTE_BANNER_COPY[disputeBanner.status].title}
            </div>
            <div className="text-[13px] text-text-secondary mt-1 leading-[18px]">
              {DISPUTE_BANNER_COPY[disputeBanner.status].body(formatBookingDate(disputeBanner.bookingDate))}
            </div>
            {disputeBanner.status !== "open" && (
              <button
                type="button"
                disabled={acknowledging}
                onClick={acknowledgeDispute}
                className="mt-3 text-[13px] font-semibold px-4 py-1.5 rounded-md bg-primary text-white disabled:opacity-60"
              >
                Oké!
              </button>
            )}
          </div>
        </div>
      )}
      {completedBanner && (
        <div className="px-5 pt-4">
          <Card variant="inverse" padding={16} onClick={() => router.push(`/klant/status?bookingId=${completedBanner.bookingId}`)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] text-white/60">Voltooide boeking</div>
                <div className="text-[15px] font-semibold mt-0.5">Laat een review achter</div>
              </div>
              <span className="text-accent">
                <ChevronRight size={22} />
              </span>
            </div>
          </Card>
        </div>
      )}
      {activeBooking && (
        <div className="px-5 pt-4">
          <Card variant="inverse" padding={16} onClick={() => router.push(`/klant/status?bookingId=${activeBooking.id}`)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] text-white/60">Lopende boeking</div>
                <div className="text-[15px] font-semibold mt-0.5">{ACTIVE_STATUS_LABEL[activeBooking.status]}</div>
              </div>
              <span className="text-accent">
                <ChevronRight size={22} />
              </span>
            </div>
          </Card>
        </div>
      )}
      <div className="px-5 pt-5">
        <div className="text-[34px] leading-[40px] font-bold tracking-[-0.02em]">Waar knippen we je?</div>
        <div className="mt-4" id="tut-k-address">
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Straat en huisnummer"
            leading={<span className="flex text-text-tertiary"><MapPin size={18} /></span>}
            className="flex items-center gap-2.5 h-ctrl-md px-4 rounded-md bg-surface transition-shadow duration-fast ease-groomy focus-within:shadow-focus-ring border border-transparent"
            inputClassName="flex-1 min-w-0 border-none outline-none bg-transparent font-sans text-[17px] text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <div className="flex gap-2 mt-3.5 flex-wrap" id="tut-k-tags">
          {SERVICE_TAGS.map((t) => {
            const count = selected.get(t) ?? 0;
            return (
              <div key={t} className="relative">
                {count > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center">
                    {count}
                  </span>
                )}
                <Tag selected={count > 0} onClick={() => toggleTag(t)}>
                  {t}
                </Tag>
              </div>
            );
          })}
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={resetSelection}
            className="flex items-center gap-1 mt-2.5 text-[13px] text-text-secondary"
          >
            <RotateCcw size={14} />
            Herstel selectie
          </button>
        )}
      </div>
      <div className="px-5 pt-6">
        <Card id="tut-k-book" variant="inverse" padding={20} onClick={bookService}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[17px] font-semibold">Boek direct</div>
              <div className="text-[13px] text-white/60 mt-0.5">
                {selected.size === 0 ? "Kies eerst een dienst hierboven" : "Beschikbare barbers in de buurt"}
              </div>
            </div>
            <span className="text-accent">
              <ChevronRight size={22} />
            </span>
          </div>
        </Card>
      </div>
      {recentBookings.length > 0 && (
        <div className="px-5 pt-7 flex-1">
          <div className="text-[17px] font-semibold tracking-[-0.01em] mb-1">Recent</div>
          {recentBookings.map((b) => (
            <Row
              key={b.id}
              left={<Avatar name={b.barberName} />}
              title={b.barberName}
              sub={`${b.serviceName} · ${timeAgo(b.completedAt)}`}
              right={
                <Button size="sm" variant="secondary" onClick={() => bookAgain(b)}>
                  Opnieuw
                </Button>
              }
            />
          ))}
        </div>
      )}
      {tutorialChecked && !tutorialSeenAt && tutorialUserId && (
        <OnboardingTutorial
          steps={KLANT_TUTORIAL_STEPS}
          userId={tutorialUserId}
          onFinish={() => setTutorialSeenAt(new Date().toISOString())}
        />
      )}
    </div>
  );
}
