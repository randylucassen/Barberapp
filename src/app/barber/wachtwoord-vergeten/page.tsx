"use client";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

export default function BarberForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    setLoading(false);
    if (error) {
      setError(authErrorMessage(error.message));
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar onBack={() => router.push("/barber/login")} />
      <div className="px-5 pt-2 flex-1">
        {!sent ? (
          <form onSubmit={handleSubmit}>
            <div className="text-[28px] font-bold tracking-[-0.02em]">Wachtwoord vergeten</div>
            <div className="text-[15px] text-text-secondary mt-1.5 leading-[22px]">
              Vul je e-mail in. We sturen je een link om een nieuw wachtwoord in te stellen.
            </div>
            <div className="mt-6">
              <Input
                label="E-mail"
                placeholder="naam@voorbeeld.nl"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error && (
              <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
                {error}
              </div>
            )}
            <div className="mt-5">
              <Button full type="submit" disabled={loading}>
                {loading ? "Bezig…" : "Stuur herstel-link"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center text-center pt-16">
            <div className="w-[72px] h-[72px] rounded-full bg-accent-soft text-accent flex items-center justify-center">
              <Check size={32} />
            </div>
            <div className="text-[22px] font-bold tracking-[-0.01em] mt-5">Check je inbox</div>
            <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
              We hebben een herstel-link gestuurd naar
              <br />
              <b className="text-text-primary">{email}</b>
            </div>
            <div className="mt-7 w-full">
              <Button full variant="secondary" onClick={() => router.push("/barber/login")}>Terug naar inloggen</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
