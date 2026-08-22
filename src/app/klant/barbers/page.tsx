"use client";
import Image from "next/image";
import { Heart, Star, X, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge, Button, Card, NavBar, Tabs } from "@/components/ui";
import { Avatar } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  addFavoriteBarber,
  getApprovedBarbersWithServices,
  getCompletedBarberIdsForCustomer,
  getFavoriteBarberIds,
  getReviewsForBarber,
  removeFavoriteBarber,
  type BookingServiceLineInput,
} from "@/lib/supabase/queries";
import type { BarberListItem, ReviewRecord } from "@/lib/types";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.round(hours / 24);
  return `${days} d geleden`;
}

interface WantedService {
  name: string;
  quantity: number;
}

interface MatchedServices {
  lines: BookingServiceLineInput[];
  totalPriceCents: number;
  summary: string;
}

// null = deze barber biedt niet alle gevraagde diensten aan, dus komt
// niet in aanmerking (met de gebruiker afgestemd: bij meerdere diensten
// moet een barber ze allemaal kunnen leveren, geen deel-matches).
function matchServices(barber: BarberListItem, wanted: WantedService[]): MatchedServices | null {
  if (wanted.length === 0) {
    const first = barber.services[0];
    if (!first) return null;
    return {
      lines: [{ serviceId: first.id, quantity: 1 }],
      totalPriceCents: first.priceCents,
      summary: first.name,
    };
  }
  const lines: BookingServiceLineInput[] = [];
  let totalPriceCents = 0;
  const names: string[] = [];
  for (const w of wanted) {
    const match = barber.services.find((s) => s.name === w.name);
    if (!match) return null;
    lines.push({ serviceId: match.id, quantity: w.quantity });
    totalPriceCents += match.priceCents * w.quantity;
    names.push(w.quantity > 1 ? `${w.quantity}x ${w.name}` : w.name);
  }
  return { lines, totalPriceCents, summary: names.join(", ") };
}

// Tussenscherm vóór het boeken — met de gebruiker afgestemd: portfolio/
// bio/reviews bekijken hoort bij het kiesmoment zelf (geen extra
// blokkerende "goedkeuringsstap" na het kiezen, dat vertraagt alleen
// maar zonder de klant meer controle te geven). Geldt bewust niet voor
// "Snelste beschikbare barber" — daar staat de barber nog nergens vast
// op het moment van kiezen, dus is er simpelweg niets te tonen.
function BarberDetail({
  barber,
  matched,
  onBack,
  onBook,
}: {
  barber: BarberListItem;
  matched: MatchedServices;
  onBack: () => void;
  onBook: () => void;
}) {
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setLoadingReviews(true);
    getReviewsForBarber(supabase, barber.id).then((r) => {
      setReviews(r);
      setLoadingReviews(false);
    });
  }, [barber.id]);

  return (
    <div className="relative flex flex-col h-full">
      <NavBar title="Profiel" onBack={onBack} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar">
        <div className="flex items-center gap-3.5">
          <Avatar name={barber.fullName} size={64} />
          <div>
            <div className="text-[19px] font-semibold tracking-[-0.01em]">{barber.fullName}</div>
            <div className="flex items-center gap-1 text-[13px] text-text-secondary mt-0.5">
              {barber.ratingAvg ? (
                <>
                  <span className="text-primary flex"><Star size={13} fill="currentColor" /></span>
                  <span className="font-semibold text-primary">{barber.ratingAvg}</span>
                  <span>({barber.ratingCount} reviews)</span>
                </>
              ) : (
                <span>Nieuw op Groomy</span>
              )}
              {barber.city && <span>· {barber.city}</span>}
            </div>
          </div>
        </div>

        {barber.bio && <div className="text-[14px] text-text-secondary leading-[21px] mt-4">{barber.bio}</div>}

        <div className="mt-6">
          <div className="text-[15px] font-semibold tracking-[-0.01em] mb-2">Portfolio</div>
          {barber.portfolioUrls.length === 0 ? (
            <div className="text-[14px] text-text-secondary py-2">Nog geen portfolio-foto&apos;s.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {barber.portfolioUrls.map((url) => (
                <div
                  key={url}
                  onClick={() => setZoomedPhoto(url)}
                  className="relative aspect-square rounded-md overflow-hidden bg-surface cursor-pointer"
                >
                  <Image src={url} alt="" fill className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="text-[15px] font-semibold tracking-[-0.01em] mb-1">Reviews</div>
          {!loadingReviews && reviews.length === 0 && (
            <div className="text-[14px] text-text-secondary py-2">Nog geen reviews.</div>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="py-3 border-b border-border-soft">
              <div className="flex items-center gap-2.5">
                <Avatar name={r.reviewerName} size={32} />
                <div className="flex-1">
                  <div className="text-[14px] font-semibold">{r.reviewerName}</div>
                  <div className="text-[12px] text-text-tertiary">{timeAgo(r.createdAt)}</div>
                </div>
                <div className="flex gap-0.5 text-primary">
                  {Array.from({ length: r.stars }, (_, i) => (
                    <Star key={i} size={12} fill="currentColor" />
                  ))}
                </div>
              </div>
              {r.text && <div className="text-[13px] text-[#374151] leading-5 mt-2">{r.text}</div>}
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 pt-3 pb-2 border-t border-border bg-white">
        <Button full onClick={onBook}>
          Boek · {matched.summary} · €{(matched.totalPriceCents / 100).toFixed(2).replace(".", ",")}
        </Button>
      </div>
      {zoomedPhoto && (
        <div
          onClick={() => setZoomedPhoto(null)}
          className="absolute inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Sluiten"
            onClick={() => setZoomedPhoto(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center"
          >
            <X size={20} />
          </button>
          <div className="relative w-full h-full">
            <Image src={zoomedPhoto} alt="" fill className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

function BarbersContent() {
  const router = useRouter();
  const search = useSearchParams();
  const wantedServices: WantedService[] = (() => {
    try {
      const raw = search.get("services");
      return raw ? (JSON.parse(raw) as WantedService[]) : [];
    } catch {
      return [];
    }
  })();
  const address = search.get("address") ?? "";

  const [when, setWhen] = useState("nu");
  const [barbers, setBarbers] = useState<BarberListItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [knownBarberIds, setKnownBarberIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailBarber, setDetailBarber] = useState<{ barber: BarberListItem; matched: MatchedServices } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    getApprovedBarbersWithServices(supabase).then((list) => {
      setBarbers(list.filter((b) => b.services.length > 0));
      setLoading(false);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      getFavoriteBarberIds(supabase, data.user.id).then(setFavoriteIds);
      getCompletedBarberIdsForCustomer(supabase, data.user.id).then(setKnownBarberIds);
    });
  }, []);

  async function toggleFavorite(barberId: string) {
    if (!userId) return;
    const supabase = createClient();
    const isFavorite = favoriteIds.has(barberId);
    // Optimistisch bijwerken — voelt anders traag aan voor een simpele
    // toggle, en bij een mislukte call zetten we 'm gewoon terug.
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFavorite) next.delete(barberId);
      else next.add(barberId);
      return next;
    });
    const ok = isFavorite
      ? await removeFavoriteBarber(supabase, userId, barberId)
      : await addFavoriteBarber(supabase, userId, barberId);
    if (!ok) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFavorite) next.add(barberId);
        else next.delete(barberId);
        return next;
      });
    }
  }

  function chooseBarber(barber: BarberListItem, matched: MatchedServices) {
    const params = new URLSearchParams({
      barberId: barber.id,
      lines: JSON.stringify(matched.lines),
      asap: when === "nu" ? "1" : "0",
    });
    if (address) params.set("address", address);
    router.push(`/klant/boeking?${params.toString()}`);
  }

  function chooseAuto() {
    if (wantedServices.length === 0) return;
    const params = new URLSearchParams({
      services: JSON.stringify(wantedServices),
      auto: "1",
      asap: when === "nu" ? "1" : "0",
    });
    if (address) params.set("address", address);
    router.push(`/klant/boeking?${params.toString()}`);
  }

  // "Nu" heeft alleen zin bij barbers die ook echt online zijn — een
  // offline barber kan een aanvraag toch niet meteen beantwoorden (zie
  // ook de 30-minuten-timeout op onbeantwoorde aanvragen). "Boek vooruit"
  // toont alleen barbers waar deze klant al een afgeronde boeking mee
  // heeft — vooraf vastleggen bij een wildvreemde mag niet, de eerste
  // kennismaking moet altijd via een live aanvraag ("Nu"/auto-match)
  // lopen (server-side afgedwongen in create_booking_with_services, zie
  // 0029 — dit filter is puur UX, geen beveiliging op zich).
  // "Favorieten" filtert op de klant's eigen bladwijzers (kan alleen na
  // een review, dus per definitie ook al bekend). Bij meerdere gevraagde
  // diensten moet een barber ze ALLEMAAL aanbieden (matchServices geeft
  // dan null, en die barber valt hier al af).
  const availableBarbers = when === "nu" ? barbers.filter((b) => b.isOnline) : barbers;
  const scopedBarbers =
    when === "favorieten"
      ? availableBarbers.filter((b) => favoriteIds.has(b.id))
      : when === "plan"
        ? availableBarbers.filter((b) => knownBarberIds.has(b.id))
        : availableBarbers;
  const visibleBarbers = scopedBarbers
    .map((b) => ({ barber: b, matched: matchServices(b, wantedServices) }))
    .filter((x): x is { barber: BarberListItem; matched: MatchedServices } => x.matched !== null);
  const first = visibleBarbers[0];

  if (detailBarber) {
    return (
      <BarberDetail
        barber={detailBarber.barber}
        matched={detailBarber.matched}
        onBack={() => setDetailBarber(null)}
        onBook={() => chooseBarber(detailBarber.barber, detailBarber.matched)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Kies je barber" onBack={() => router.push("/klant/home")} />
      <div className="px-5 pt-4">
        <Tabs
          items={[
            { key: "nu", label: "Nu online" },
            { key: "plan", label: "Boek vooruit" },
            { key: "favorieten", label: "Favorieten" },
          ]}
          value={when}
          onChange={setWhen}
        />
      </div>
      {wantedServices.length > 0 && (
        <div className="px-5 pt-3">
          <Card variant="inverse" padding={16}>
            <div className="flex items-center gap-3.5">
              <span className="text-accent"><Zap size={22} fill="currentColor" /></span>
              <div className="flex-1">
                <div className="text-[15px] font-semibold">Snelste beschikbare barber</div>
                <div className="text-[12px] text-white/60 mt-0.5">Wij wijzen automatisch de dichtstbijzijnde geschikte barber toe</div>
              </div>
              <Button variant="accent" onClick={chooseAuto}>Kies</Button>
            </div>
          </Card>
        </div>
      )}
      {when === "nu" && (
        <div className="px-5 pt-2 text-[12px] text-text-tertiary/70">
          Tip: klik op de barber om zijn portfolio in te zien!
        </div>
      )}
      <div className="px-5 pt-2 flex-1 overflow-y-auto no-scrollbar">
        {!loading && visibleBarbers.length === 0 && (
          <div className="text-[14px] text-text-secondary pt-6 text-center">
            {when === "favorieten"
              ? "Nog geen favoriete barbers. Zet een barber als favoriet na een boeking, of via het hartje hierboven."
              : when === "plan"
                ? "Je kunt pas vooruit plannen bij een specifieke barber zodra je al een afspraak met diegene hebt gehad. Maak eerst een aanvraag in de buurt aan via \"Nu\" — daarna verschijnt die barber hier."
                : barbers.length === 0
                  ? "Nog geen barbers beschikbaar in jouw omgeving."
                  : wantedServices.length > 1
                    ? "Geen enkele barber biedt op dit moment al deze diensten samen aan."
                    : knownBarberIds.size > 0
                      ? "Op dit moment is geen enkele barber online. Probeer \"Boek vooruit\" om later in te plannen."
                      : "Op dit moment is geen enkele barber online. Probeer het straks nog eens."}
          </div>
        )}
        {visibleBarbers.map(({ barber: b, matched }, i) => {
          const isFavorite = favoriteIds.has(b.id);
          return (
            <div
              key={b.id}
              onClick={() => setDetailBarber({ barber: b, matched })}
              className="flex gap-3.5 items-center py-4 border-b border-border-soft cursor-pointer"
            >
              <Avatar name={b.fullName} size={56} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold tracking-[-0.01em]">{b.fullName}</span>
                  {i === 0 && when !== "favorieten" && <Badge variant="accent">Snelste</Badge>}
                  <button
                    type="button"
                    aria-label={isFavorite ? "Verwijder als favoriet" : "Zet als favoriet"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(b.id);
                    }}
                    className={isFavorite ? "text-error" : "text-text-tertiary"}
                  >
                    <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
                  </button>
                </div>
                <div className="flex items-center gap-1 text-[13px] text-text-secondary mt-0.5">
                  {b.ratingAvg ? (
                    <>
                      <span className="text-primary flex"><Star size={13} fill="currentColor" /></span>
                      <span className="font-semibold text-primary">{b.ratingAvg}</span>
                      <span>({b.ratingCount})</span>
                    </>
                  ) : (
                    <span>Nieuw op Groomy</span>
                  )}
                </div>
                <div className="text-[13px] text-text-secondary mt-0.5">{b.isOnline ? "Nu beschikbaar" : "Nu niet online"}</div>
              </div>
              <div className="text-right">
                <div className="text-[17px] font-bold">€{(matched.totalPriceCents / 100).toFixed(2).replace(".", ",")}</div>
                <div className="text-[12px] text-text-tertiary max-w-[120px] truncate">{matched.summary.toLowerCase()}</div>
              </div>
            </div>
          );
        })}
      </div>
      {first && (
        <div className="px-5 pt-3 pb-2 border-t border-border bg-white">
          <Button full onClick={() => setDetailBarber({ barber: first.barber, matched: first.matched })}>
            Bekijk {first.barber.fullName.split(" ")[0]} · €{(first.matched.totalPriceCents / 100).toFixed(2).replace(".", ",")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function BarbersPage() {
  return (
    <Suspense>
      <BarbersContent />
    </Suspense>
  );
}
