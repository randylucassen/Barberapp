"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

export default function BarberRegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Wachtwoord moet minimaal 8 tekens zijn.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: "barber", full_name: fullName, phone, referral_code: referralCode.trim() },
      },
    });

    if (error) {
      setError(authErrorMessage(error.message));
      setLoading(false);
      return;
    }

    router.push("/barber/bevestig-email");
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar onBack={() => router.push("/barber/login")} />
      <form onSubmit={handleSubmit} className="px-5 pt-2 flex-1 overflow-y-auto no-scrollbar flex flex-col">
        <div className="text-[28px] font-bold tracking-[-0.02em]">Word Groomy-barber</div>
        <div className="text-[15px] text-text-secondary mt-1.5">Maak eerst je account aan.</div>
        <div className="flex flex-col gap-3 mt-6">
          <Input
            label="Naam"
            placeholder="Voor- en achternaam"
            name="name"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
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
            label="Telefoon"
            placeholder="06 12345678"
            type="tel"
            name="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Wachtwoord"
            placeholder="Minimaal 8 tekens"
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Referral-code (optioneel)"
            placeholder="Bijv. AB12CD"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value)}
          />
        </div>
        {error && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        )}
        <div className="mt-4 text-[13px] text-text-secondary leading-[19px]">
          Door te registreren ga je akkoord met de{" "}
          <Link href="/voorwaarden" className="font-semibold text-text-primary underline">voorwaarden</Link> en het{" "}
          <Link href="/privacybeleid" className="font-semibold text-text-primary underline">privacybeleid</Link>.
        </div>
        <div className="mt-auto pb-2 pt-3">
          <Button full type="submit" variant="accent" disabled={loading}>
            {loading ? "Bezig…" : "Maak account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
