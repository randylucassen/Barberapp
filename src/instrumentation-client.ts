import * as Sentry from "@sentry/nextjs";

// Zonder NEXT_PUBLIC_SENTRY_DSN (bv. lokaal ontwikkelen) init't dit met
// dsn: undefined — Sentry's SDK stuurt dan simpelweg niets, geen foutmelding.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
