"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/supabase/errors";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Wachtwoord moet minimaal 8 tekens zijn.");
      return;
    }
    if (password !== confirm) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

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
      <NavBar title="Nieuw wachtwoord" />
      <form onSubmit={handleSubmit} className="px-5 pt-2 flex-1">
        <div className="text-[15px] text-text-secondary leading-[22px]">
          Kies een nieuw wachtwoord voor je account.
        </div>
        <div className="flex flex-col gap-3 mt-6">
          <Input
            label="Nieuw wachtwoord"
            placeholder="Minimaal 8 tekens"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Bevestig wachtwoord"
            placeholder="Herhaal wachtwoord"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        )}
        <div className="mt-5">
          <Button full type="submit" disabled={loading}>
            {loading ? "Bezig…" : "Wachtwoord instellen"}
          </Button>
        </div>
      </form>
    </div>
  );
}
