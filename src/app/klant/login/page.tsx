"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

// OAuth (Apple/Google) staat nog niet aan — de knoppen in het design
// bestaan al, maar de echte flow volgt in een latere fase.
const OAUTH_ENABLED = false;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(authErrorMessage(error.message));
      setLoading(false);
      return;
    }

    router.push("/klant/home");
    router.refresh();
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar onBack={() => router.push("/klant/onboarding")} />
      <form onSubmit={handleSubmit} className="px-5 pt-2 flex-1 flex flex-col">
        <div className="text-[28px] font-bold tracking-[-0.02em]">Inloggen</div>
        <div className="text-[15px] text-text-secondary mt-1.5">Welkom terug bij Groomy.</div>
        <div className="flex flex-col gap-3 mt-6">
          <Input
            label="E-mail"
            placeholder="naam@voorbeeld.nl"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Wachtwoord"
            placeholder="••••••••"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        )}
        <div className="mt-3 text-right">
          <span
            onClick={() => router.push("/klant/wachtwoord-vergeten")}
            className="text-[14px] font-semibold text-accent cursor-pointer"
          >
            Wachtwoord vergeten?
          </span>
        </div>
        <div className="mt-5">
          <Button full type="submit" disabled={loading}>
            {loading ? "Bezig met inloggen…" : "Log in"}
          </Button>
        </div>
        {OAUTH_ENABLED && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[13px] text-text-tertiary">of</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="flex flex-col gap-2.5">
              <Button full type="button" variant="secondary">Ga verder met Apple</Button>
              <Button full type="button" variant="secondary">Ga verder met Google</Button>
            </div>
          </>
        )}
      </form>
      <div className="px-5 pb-2 pt-3 text-center text-[14px] text-text-secondary">
        Nog geen account?{" "}
        <span onClick={() => router.push("/klant/register")} className="font-semibold text-text-primary cursor-pointer">
          Registreer
        </span>
      </div>
      <div className="px-5 pb-4 text-center text-[12px] text-text-tertiary">
        <Link href="/privacybeleid" className="underline">Privacybeleid</Link>
        {" · "}
        <Link href="/voorwaarden" className="underline">Voorwaarden</Link>
      </div>
    </div>
  );
}
