import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

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
