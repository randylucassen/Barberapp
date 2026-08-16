import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Alleen de host nodig (bv. xzlppuvfgfjxeqdmrmsu.supabase.co) — dezelfde
// host serveert zowel de API als Storage-bestanden (barber-portfolio-/
// documentfoto's), dus één remotePattern/CSP-bron dekt beide.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

// Sentry's SDK stuurt events rechtstreeks vanuit de browser naar de
// ingest-host uit de DSN zelf (bv. o123.ingest.us.sentry.io) — zonder
// deze in connect-src zou onze eigen CSP Sentry's eigen foutrapportage
// blokkeren.
const sentryIngestHost = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).hostname
  : undefined;

// De CSP wordt alleen in productie afgedwongen — Next.js' dev-server
// heeft 'unsafe-eval' (webpack HMR) en een losse websocket-verbinding
// nodig die een strikte CSP alleen maar in de weg zit tijdens lokaal
// ontwikkelen, zonder productiewaarde.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://api.mapbox.com${supabaseHost ? ` https://${supabaseHost}` : ""}`,
  "font-src 'self' data:",
  // worker-src blob: is nodig voor mapbox-gl's tegel-verwerking (Web Workers
  // via een blob:-URL) — zonder dit valt `script-src` terug als default en
  // die mist blob:, waardoor de kaart nooit initialiseert.
  "worker-src 'self' blob:",
  `connect-src 'self' https://api.mapbox.com https://events.mapbox.com${supabaseHost ? ` https://${supabaseHost}` : ""} https://api.stripe.com${sentryIngestHost ? ` https://${sentryIngestHost}` : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://connect.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: csp }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

// Geen SENTRY_AUTH_TOKEN in deze fase (zie PROJECT.md) — sourcemap-
// upload staat daarom uit, anders probeert de build tevergeefs in te
// loggen bij Sentry. Foutmeldingen komen gewoon aan, alleen zonder
// leesbare originele bestandsnamen/regelnummers in de Sentry-UI.
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
  webpack: { treeshake: { removeDebugLogging: true } },
});
