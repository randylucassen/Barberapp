"use client";
import { Check } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { getWalletTopup } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import type { WalletTopup } from "@/lib/types";

const POLL_MS = 2000;
const MAX_ATTEMPTS = 15;

function TopupSuccessContent({ homePath, walletPath }: { homePath: string; walletPath: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const topupId = search.get("topupId");
  const [topup, setTopup] = useState<WalletTopup | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!topupId) return;
    const supabase = createClient();

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      // Een mislukte tick (bv. even geen netwerk) mag de polling niet
      // laten crashen — telt gewoon mee als poging richting de timeout.
      try {
        const t = await getWalletTopup(supabase, topupId);
        if (t && t.status === "succeeded") {
          setTopup(t);
          clearInterval(interval);
          return;
        }
      } catch {
        // niets doen, telt als mislukte poging hieronder
      }
      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true);
        clearInterval(interval);
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [topupId]);

  if (!topup) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-7 text-center">
        <div className="w-[88px] h-[88px] rounded-full bg-surface text-text-secondary flex items-center justify-center">
          <Check size={40} />
        </div>
        <div className="text-[22px] font-bold tracking-[-0.01em] mt-6">
          {timedOut ? "Betaling wordt nog verwerkt" : "Betaling verwerken…"}
        </div>
        <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
          {timedOut
            ? "Dit duurt langer dan verwacht. Je saldo wordt zo dadelijk bijgewerkt."
            : "Even geduld, we bevestigen je opwaardering."}
        </div>
        {timedOut && (
          <div className="mt-8 w-full">
            <Button full variant="accent" onClick={() => router.push(walletPath)}>
              Naar je wallet
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full items-center justify-center px-7 text-center">
      <div className="w-[88px] h-[88px] rounded-full bg-primary text-accent flex items-center justify-center">
        <Check size={40} />
      </div>
      <div className="text-[28px] font-bold tracking-[-0.02em] mt-6">Saldo bijgewerkt</div>
      <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
        Er is <b className="text-text-primary">€{euro(topup.amountCents)}</b> bijgeschreven
        {topup.bonusCents > 0 && (
          <>
            {" "}
            + <b className="text-text-primary">€{euro(topup.bonusCents)} bonus</b>
          </>
        )}
        .
      </div>
      <div className="mt-8 w-full flex flex-col gap-2.5">
        <Button full variant="accent" onClick={() => router.push(walletPath)}>
          Naar je wallet
        </Button>
        <Button full variant="ghost" onClick={() => router.push(homePath)}>Terug naar home</Button>
      </div>
    </div>
  );
}

// Gedeeld tussen /klant/wallet/opwaarderen/succes en
// /barber/wallet/opwaarderen/succes — pollt wallet_topups.status (zelfde
// patroon als klant/succes dat op payments pollt), want een client-side
// Stripe-redirect alleen is geen bewijs dat de webhook al verwerkt is.
export function TopupSuccess({ homePath, walletPath }: { homePath: string; walletPath: string }) {
  return (
    <Suspense>
      <TopupSuccessContent homePath={homePath} walletPath={walletPath} />
    </Suspense>
  );
}
