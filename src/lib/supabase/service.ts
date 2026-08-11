import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase-client — omzeilt RLS volledig. Uitsluitend te
// gebruiken in Route Handlers die geen (of niet de juiste) gebruikers-
// sessie hebben maar wél mogen schrijven naar tabellen zonder
// client-grant (payments, disputes.status, barber_profiles.stripe_*
// vanuit de webhook, enz.): /api/stripe/webhook en
// /api/cron/release-escrow. Nooit importeren in client-code — de service
// role key mag nooit naar de browser lekken.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
