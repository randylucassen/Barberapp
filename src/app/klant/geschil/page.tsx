"use client";
import { AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, NavBar } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { openDispute } from "@/lib/supabase/queries";

function DisputeContent() {
  const router = useRouter();
  const search = useSearchParams();
  const bookingId = search.get("bookingId");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!bookingId || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setError("Je moet ingelogd zijn.");
      setSubmitting(false);
      return;
    }
    const ok = await openDispute(supabase, bookingId, data.user.id, reason.trim());
    setSubmitting(false);
    if (!ok) {
      setError("Melden is niet gelukt — mogelijk is het venster van 24 uur al verstreken.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-7 text-center">
        <div className="text-[20px] font-bold tracking-[-0.01em]">Melding ontvangen</div>
        <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
          We bekijken je melding en nemen zo nodig contact met je op. Je betaling blijft veilig vast
          totdat dit is opgelost.
        </div>
        <Button full className="mt-6" onClick={() => router.push("/klant/home")}>Naar home</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Probleem melden" onBack={() => router.back()} />
      <div className="px-5 pt-4 flex-1">
        <div className="bg-error-soft rounded-md px-4 py-3.5 flex gap-3 items-start">
          <span className="text-error-text flex-shrink-0 mt-px"><AlertTriangle size={18} /></span>
          <div className="text-[13px] text-error-text leading-[19px]">
            Dit blokkeert de uitbetaling aan je barber totdat het is opgelost. Kan alleen binnen 24 uur
            na afronding van de knipbeurt.
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[15px] font-semibold mb-2">Wat ging er mis?</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Beschrijf wat er is gebeurd…"
            rows={6}
            className="w-full bg-surface rounded-md px-4 py-3 text-[15px] placeholder:text-text-tertiary border-none outline-none resize-none"
          />
        </div>
        {error && (
          <div className="mt-3 bg-error-soft text-error-text text-[13px] rounded-md px-3 py-2.5 leading-[18px]">
            {error}
          </div>
        )}
      </div>
      <div className="px-5 pt-3 pb-2">
        <Button full variant="accent" disabled={!reason.trim() || submitting} onClick={handleSubmit}>
          {submitting ? "Bezig…" : "Versturen"}
        </Button>
      </div>
    </div>
  );
}

export default function DisputePage() {
  return (
    <Suspense>
      <DisputeContent />
    </Suspense>
  );
}
