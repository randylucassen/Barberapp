import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Proxyt server-side naar Nominatim (OpenStreetMap) — niet rechtstreeks
// vanuit de client, zoals Nominatim's gebruiksvoorwaarden vereisen (eigen
// User-Agent, geen bulkgebruik). Gratis, geen API-key. Bij schaal is dit
// een kandidaat om te vervangen door Mapbox/Google Geocoding (zie
// CLAUDE.md) — voor deze MVP-schaal (losse boekingen, geen bulk) is de
// impliciete ~1 req/s-limiet van Nominatim geen probleem. Dit is de enige
// volledig onbeveiligde route in de app (geen sessie-check), vandaar de
// rate limit (Fase 11) — zonder die limiet kan iemand dit misbruiken als
// gratis open geocoding-proxy.
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "geocode", requests: 20, window: "60 s" });
  if (limited) return limited;

  const address = request.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "address is verplicht" }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "nl");

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Groomy-MVP/1.0 (barber-marketplace webapp)",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Geocoding-service niet bereikbaar" }, { status: 502 });
  }

  const results = (await res.json()) as { lat: string; lon: string }[];
  if (results.length === 0) {
    return NextResponse.json({ error: "Adres niet gevonden" }, { status: 404 });
  }

  return NextResponse.json({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
}
