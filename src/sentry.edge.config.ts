import * as Sentry from "@sentry/nextjs";

// Draait in middleware.ts (Edge runtime) — vangt daar gooiende fouten op
// (bv. een onverwachte Supabase-clientfout tijdens de rol-/schorsingscheck)
// die anders alleen in Vercel's functielogs zichtbaar zouden zijn.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
