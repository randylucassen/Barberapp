import Stripe from "stripe";

// Server-only Stripe-client. Nooit importeren in client-code — de secret
// key mag nooit naar de browser lekken. apiVersion bewust niet vastgepind
// op een letterlijke string: de geïnstalleerde SDK-versie (package.json)
// bepaalt welke API-versie geldig is, en dat voorkomt een verouderde
// hardcoded versiestring bij een toekomstige SDK-upgrade.
//
// Lazy geïnstantieerd (niet op module-niveau): Next.js laadt route-
// modules ook tijdens `next build` (page-data collection), nog vóórdat
// STRIPE_SECRET_KEY per se gezet hoeft te zijn — een eager `new Stripe()`
// op module-niveau laat de build daardoor onnodig falen.
let client: Stripe | undefined;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return client;
}
