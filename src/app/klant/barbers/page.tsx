"use client";
import { Heart, Star, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge, Button, Card, NavBar, Tabs } from "@/components/ui";
import { Avatar } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import {
  addFavoriteBarber,
  getApprovedBarbersWithServices,
  getFavoriteBarberIds,
  removeFavoriteBarber,
  type BookingServiceLineInput,
} from "@/lib/supabase/queries";
import type { BarberListItem } from "@/lib/types";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  // (was "Gepland") toont iedereen, want daarvoor hoeft niemand nu online
  // te zijn. "Favorieten" filtert op de klant's eigen bladwijzers. Bij
  // meerdere gevraagde diensten moet een barber ze ALLEMAAL aanbieden
  // (matchServices geeft dan null, en die barber valt hier al af).
  const availableBarbers = when === "nu" ? barbers.filter((b) => b.isOnline) : barbers;
  const scopedBarbers = when === "favorieten" ? availableBarbers.filter((b) => favoriteIds.has(b.id)) : availableBarbers;
  const visibleBarbers = scopedBarbers
    .map((b) => ({ barber: b, matched: matchServices(b, wantedServices) }))
    .filter((x): x is { barber: BarberListItem; matched: MatchedServices } => x.matched !== null);
  const first = visibleBarbers[0];

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Kies je barber" onBack={() => router.push("/klant/home")} />
      <div className="px-5 pt-4">
        <Tabs
          items={[
            { key: "nu", label: "Nu" },
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
      <div className="px-5 pt-2 flex-1 overflow-y-auto no-scrollbar">
        {!loading && visibleBarbers.length === 0 && (
          <div className="text-[14px] text-text-secondary pt-6 text-center">
            {when === "favorieten"
              ? "Nog geen favoriete barbers. Zet een barber als favoriet na een boeking, of via het hartje hierboven."
              : barbers.length === 0
                ? "Nog geen barbers beschikbaar in jouw omgeving."
                : wantedServices.length > 1
                  ? "Geen enkele barber biedt op dit moment al deze diensten samen aan."
                  : "Op dit moment is geen enkele barber online. Probeer \"Boek vooruit\" om later in te plannen."}
          </div>
        )}
        {visibleBarbers.map(({ barber: b, matched }, i) => {
          const isFavorite = favoriteIds.has(b.id);
          return (
            <div
              key={b.id}
              onClick={() => chooseBarber(b, matched)}
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
          <Button full onClick={() => chooseBarber(first.barber, first.matched)}>
            Kies {first.barber.fullName.split(" ")[0]} · €{(first.matched.totalPriceCents / 100).toFixed(2).replace(".", ",")}
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
