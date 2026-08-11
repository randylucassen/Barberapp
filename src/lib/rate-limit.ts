import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

// Zonder Upstash-credentials (bv. lokaal ontwikkelen) is er geen limiet —
// dat is bewust geen harde vereiste om lokaal te kunnen werken, alleen in
// productie (waar deze env vars wél gezet zijn) is de limiet actief.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]) {
  if (!redis) return null;
  const cached = limiters.get(prefix);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `groomy:ratelimit:${prefix}`,
  });
  limiters.set(prefix, limiter);
  return limiter;
}

// Aan het begin van een route handler aanroepen — retourneert een kant-
// en-klare 429-response bij overschrijding, of null als de aanroep door
// mag (zelfde vroege-return-stijl als requireAdmin() in
// src/lib/supabase/admin.ts).
export async function checkRateLimit(
  request: NextRequest,
  opts: { prefix: string; requests: number; window: Parameters<typeof Ratelimit.slidingWindow>[1] }
): Promise<NextResponse | null> {
  const limiter = getLimiter(opts.prefix, opts.requests, opts.window);
  if (!limiter) return null;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success } = await limiter.limit(`${opts.prefix}:${ip}`);
  if (!success) {
    return NextResponse.json(
      { error: "Te veel verzoeken. Probeer het over een minuut opnieuw." },
      { status: 429 }
    );
  }
  return null;
}
