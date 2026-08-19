import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";

// Tijdelijke debug-probe, zelfde techniek als eerder bij de Mapbox-token-
// bug — direct weer verwijderen na gebruik. (check 2)
export async function GET() {
  return NextResponse.json({
    getSiteUrl: getSiteUrl(),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    VERCEL_URL: process.env.VERCEL_URL ?? null,
  });
}
