import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/site-url";

// Tijdelijke debug-probe, zelfde techniek als eerder bij de Mapbox-token-
// bug — direct weer verwijderen na gebruik. (check 4)
export async function GET() {
  const allNextPublicKeys = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC"));
  return NextResponse.json({
    getSiteUrl: getSiteUrl(),
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    VERCEL_URL: process.env.VERCEL_URL ?? null,
    VERCEL_ENV: process.env.VERCEL_ENV ?? null,
    allNextPublicKeys,
  });
}
