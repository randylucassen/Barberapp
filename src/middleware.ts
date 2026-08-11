import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { ROLE_HOME, ROLE_LOGIN } from "@/lib/supabase/queries";
import type { UserRole } from "@/lib/types";

// Schermen die altijd bereikbaar zijn, ongeacht sessie.
const PUBLIC_ROUTES = new Set([
  "/",
  "/klant/onboarding",
  "/klant/login",
  "/klant/register",
  "/klant/bevestig-email",
  "/klant/wachtwoord-vergeten",
  "/klant/wachtwoord-instellen",
  "/barber/login",
  "/barber/register",
  "/barber/bevestig-email",
  "/barber/wachtwoord-vergeten",
  "/barber/wachtwoord-instellen",
  "/admin/login",
  "/geschorst",
]);

// /klant/fout/[kind] (foutstaten) en /auth/* (confirm-link handler + error
// pagina) zijn per-prefix publiek.
const PUBLIC_PREFIXES = ["/klant/fout", "/auth"];

// Op deze schermen hoort een al ingelogde gebruiker niet: stuur ze naar hun
// eigen home i.p.v. opnieuw te registreren/in te loggen.
const AUTH_ENTRY_ROUTES = new Set([
  "/",
  "/klant/login",
  "/klant/register",
  "/barber/login",
  "/barber/register",
]);

function isPublicRoute(pathname: string) {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const rawRole = user?.user_metadata?.role as string | undefined;
  const role = rawRole === "customer" || rawRole === "barber" ? (rawRole as UserRole) : undefined;

  // Admin (Fase 10) staat los van ROLE_HOME/ROLE_LOGIN — die zijn
  // getypeerd op UserRole (customer/barber) en zouden hier undefined
  // opleveren voor een admin-sessie.
  if (user && rawRole === "admin" && AUTH_ENTRY_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (user && role && AUTH_ENTRY_ROUTES.has(pathname)) {
    return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  }

  if (isPublicRoute(pathname)) {
    return supabaseResponse;
  }

  // /admin/* is een losstaande identiteit (admin_users), geen overlap
  // met de klant/barber-rollen hieronder. Een klant/barber die hier per
  // ongeluk op terechtkomt wordt stil naar de eigen home gestuurd — geen
  // foutmelding die verraadt dat er een adminpanel bestaat.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    // admin_users heeft bewust geen enkele client-grant (zelfde precedent
    // als discount_codes) — de gewone sessie-client zou hier altijd een
    // permission-denied (dus data: null) teruggeven, ook voor een echte
    // admin. Deze check moet daarom met de service role, die RLS/grants
    // omzeilt.
    const { data: admin } = await createServiceClient()
      .from("admin_users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!admin) {
      if (role) return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return supabaseResponse;
  }

  const isKlantRoute = pathname.startsWith("/klant/");
  const isBarberRoute = pathname.startsWith("/barber/");

  if (!isKlantRoute && !isBarberRoute) {
    return supabaseResponse;
  }

  const requiredRole: UserRole = isKlantRoute ? "customer" : "barber";

  if (!user || !role) {
    return NextResponse.redirect(new URL(ROLE_LOGIN[requiredRole], request.url));
  }

  if (role !== requiredRole) {
    return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
  }

  // Schorsing (Fase 10) — klanten via profiles.suspended, barbers via de
  // al sinds Fase 1/2 bestaande barber_status = 'suspended'-waarde.
  const { data: profile } = await supabase
    .from("profiles")
    .select("suspended, barber_status, onboarding_completed")
    .eq("id", user.id)
    .single();
  if (profile?.suspended || profile?.barber_status === "suspended") {
    return NextResponse.redirect(new URL("/geschorst", request.url));
  }

  // Verificatiestatus afdwingen (was tot nu toe alleen zichtbaar, niet
  // afgedwongen — een pending/rejected barber kon gewoon bij
  // /barber/dashboard komen en zichzelf online zetten, ook al negeerde
  // de matching hem toch al stilzwijgend). Twee routes blijven altijd
  // bereikbaar voor een barber die dit betreft: /barber/aanmelden (nog
  // niet ingevuld) en /barber/in-behandeling (wel ingevuld, wacht op
  // goedkeuring) — anders ontstaat een redirect-loop.
  if (isBarberRoute) {
    if (!profile?.onboarding_completed && pathname !== "/barber/aanmelden") {
      return NextResponse.redirect(new URL("/barber/aanmelden", request.url));
    }
    if (
      profile?.onboarding_completed &&
      (profile.barber_status === "pending" || profile.barber_status === "rejected") &&
      pathname !== "/barber/in-behandeling"
    ) {
      return NextResponse.redirect(new URL("/barber/in-behandeling", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
