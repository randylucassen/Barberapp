import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Bewust een andere bron dan /api/geocode (Nominatim): Nominatim's eigen
// gebruiksvoorwaarden verbieden expliciet autocomplete/typeahead-gebruik
// ("no autocomplete"), en dat is precies wat dit endpoint doet (een call
// per toetsaanslag, gedebounced). PDOK Locatieserver (Kadaster, NL-
// overheid) is wél gratis, keyless, en specifiek voor dit doel gebouwd —
// dus voor suggesties tijdens typen gebruiken we die, en blijft /api/
// geocode (Nominatim) ongewijzigd de bron voor de uiteindelijke
// lat/lng-opzoek zodra een klant een echt adres heeft gekozen/ingevuld.
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, { prefix: "address-suggest", requests: 60, window: "60 s" });
  if (limited) return limited;

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json([]);
  }

  const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest");
  url.searchParams.set("q", q);
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set("rows", "5");

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json([]);
  }

  const data = (await res.json()) as { response?: { docs?: { weergavenaam: string }[] } };
  const labels = (data.response?.docs ?? []).map((d) => d.weergavenaam);
  return NextResponse.json(labels);
}
