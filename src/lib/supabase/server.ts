import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { createClient as createSupabaseJsClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// Server-side Supabase client voor Server Components, Route Handlers en
// Server Actions. `cookies()` is async in Next.js 15.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll wordt ook aangeroepen vanuit Server Components, waar
            // cookies niet geschreven mogen worden — onschadelijk te
            // negeren zolang middleware de sessie ververst.
          }
        },
      },
    }
  );
}

// Herkent de aanroepende gebruiker via cookies (de webapp) of, als er
// geen cookiesessie is maar wel een `Authorization: Bearer <token>`-
// header, via die token (de native app — KPPRTJE-app, React Native —
// heeft geen cookies, zie het native-conversieplan). Toegevoegd zodat
// routes die een server-secret nodig hebben (bv. Stripe payment-intents)
// door beide clients aangeroepen kunnen worden zonder een tweede backend.
//
// Belangrijk: voor het bearer-pad is `auth.getUser(jwt)` op zichzelf niet
// genoeg — dat valideert alleen wíe de aanroeper is, maar de meegegeven
// `supabase`-client (cookie-based) zou daarna alsnog met de anon-key
// bevragen voor `.from()`/`.rpc()`-calls, dus RLS zou de rijen van de
// gebruiker niet zien. Voor het bearer-pad wordt daarom een aparte,
// kortstondige client teruggegeven die de token als Authorization-header
// meestuurt op élke request — zo evalueert RLS `auth.uid()` correct.
// Cookie-pad blijft ongewijzigd: dezelfde `supabase`-client die is
// meegegeven.
export async function getRequestUser(
  request: NextRequest,
  supabase: SupabaseClient
): Promise<{ user: User | null; supabase: SupabaseClient }> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (bearerToken) {
    const bearerClient = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
        auth: { persistSession: false },
      }
    );
    const { data } = await bearerClient.auth.getUser(bearerToken);
    return { user: data.user, supabase: bearerClient };
  }

  const { data } = await supabase.auth.getUser();
  return { user: data.user, supabase };
}
