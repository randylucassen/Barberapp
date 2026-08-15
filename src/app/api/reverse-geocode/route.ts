import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Voor de "gebruik huidige locatie"-knop op AddressAutocomplete: de
// browser geeft alleen lat/lng terug (Geolocation API), dus die moet
// omgezet worden naar een leesbaar adres. Zelfde bron als /api/address-
// suggest (PDOK Locatieserver — gratis, keyless, NL-overheid) i.p.v.
// Nominatim, voor consistentie met de rest van de adres-suggestiestack.
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "reverse-geocode", requests: 30, window: "60 s" });
  if (limited) return limited;

  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");
  if (!lat || !lon) {
    return NextResponse.json({ error: "lat en lon zijn verplicht" }, { status: 400 });
  }

  const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("rows", "1");
  url.searchParams.set("fq", "type:adres");

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ address: null });
  }

  const data = (await res.json()) as { response?: { docs?: { weergavenaam: string }[] } };
  const address = data.response?.docs?.[0]?.weergavenaam ?? null;
  return NextResponse.json({ address });
}
