import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/supabase/queries";
import type { UserRole } from "@/lib/types";

// Ontvangt de link uit de "Confirm signup"- en "Reset password"-mails
// (formaat: /auth/confirm?token_hash=...&type=...), verifieert de token
// server-side (zet de sessiecookie) en stuurt door naar de juiste plek op
// basis van het type en de rol uit user_metadata.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error && data.user) {
      const role = data.user.user_metadata?.role as UserRole | undefined;

      if (type === "recovery") {
        const target = role === "barber" ? "/barber/wachtwoord-instellen" : "/klant/wachtwoord-instellen";
        return NextResponse.redirect(`${origin}${target}`);
      }

      if (role === "barber") {
        return NextResponse.redirect(`${origin}/barber/aanmelden`);
      }
      return NextResponse.redirect(`${origin}${ROLE_HOME[role ?? "customer"]}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
