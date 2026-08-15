"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

// Geen "Registreren"-link, geen kruisverwijzing vanuit klant-/
// barberschermen — alleen bereikbaar door de URL zelf te kennen. Het
// eerste (en voorlopig enige) admin-account wordt buiten de UI om
// aangemaakt via de Supabase Admin API, zie PROJECT.md.
export default function AdminLoginPage() {
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

    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="text-[24px] font-bold tracking-[-0.02em]">Groomy Admin</div>
        <div className="text-[14px] text-text-secondary mt-1.5">Inloggen als beheerder.</div>
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
        <div className="mt-5">
          <Button full type="submit" disabled={loading}>
            {loading ? "Bezig met inloggen…" : "Log in"}
          </Button>
        </div>
      </form>
    </div>
  );
}
