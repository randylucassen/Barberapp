"use client";
import { Gift, Share2, Wallet as WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, NavBar } from "@/components/ui";
import { EmptyState, Row, SectionLabel } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getMyReferralStats, getWallet, getWalletLedger, redeemLoyaltyPoints } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";
import { LOYALTY_MIN_REDEEM_POINTS } from "@/lib/wallet";
import type { ReferralStats, WalletLedgerEntry, WalletRecord } from "@/lib/types";

const LEDGER_LABELS: Record<WalletLedgerEntry["entryType"], string> = {
  topup: "Opgewaardeerd",
  topup_bonus: "Opwaardeer-bonus",
  loyalty_redemption: "Punten ingewisseld",
  referral_bonus_referrer: "Referral-bonus",
  referral_bonus_referee: "Welkomstbonus",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Zojuist";
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} u geleden`;
  const days = Math.round(hours / 24);
  return `${days} d geleden`;
}

interface WalletOverviewProps {
  onBack: () => void;
  topupPath: string;
  showLoyalty: boolean;
}

// Gedeeld tussen /klant/wallet en /barber/wallet (Fase 9) — referral geldt
// voor beide rollen (referral_code staat op elk profiel), loyaliteitspunten
// zijn bewust klant-only (zie 0014_wallet_loyalty_fase9.sql), vandaar de
// showLoyalty-prop.
export function WalletOverview({ onBack, topupPath, showLoyalty }: WalletOverviewProps) {
  const router = useRouter();
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const [w, l, r] = await Promise.all([
      getWallet(supabase, data.user.id),
      getWalletLedger(supabase, data.user.id),
      getMyReferralStats(supabase),
    ]);
    setWallet(w);
    setLedger(l);
    setReferral(r);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleRedeem() {
    if (!wallet) return;
    const points = Math.floor(wallet.loyaltyPoints / LOYALTY_MIN_REDEEM_POINTS) * LOYALTY_MIN_REDEEM_POINTS;
    if (points < LOYALTY_MIN_REDEEM_POINTS) return;
    setRedeeming(true);
    const supabase = createClient();
    const { ok } = await redeemLoyaltyPoints(supabase, points);
    if (ok) await refresh();
    setRedeeming(false);
  }

  async function handleCopyCode() {
    if (!referral) return;
    await navigator.clipboard.writeText(referral.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canRedeem = (wallet?.loyaltyPoints ?? 0) >= LOYALTY_MIN_REDEEM_POINTS;

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Wallet" onBack={onBack} />
      <div className="px-5 pt-4 flex-1 overflow-y-auto no-scrollbar pb-6">
        <Card variant="inverse" padding={20}>
          <div className="text-[13px] text-white/70">Saldo</div>
          <div className="text-[32px] font-bold tracking-[-0.02em] mt-1">
            €{euro(wallet?.balanceCents ?? 0)}
          </div>
          <div className="mt-4">
            <Button variant="accent" size="md" onClick={() => router.push(topupPath)}>
              Opwaarderen
            </Button>
          </div>
        </Card>

        {showLoyalty && (
          <>
            <SectionLabel>Loyaliteitspunten</SectionLabel>
            <Row
              left={<span className="text-accent flex"><Gift size={20} /></span>}
              title={`${wallet?.loyaltyPoints ?? 0} punten`}
              sub={`${LOYALTY_MIN_REDEEM_POINTS} punten = €${euro(LOYALTY_MIN_REDEEM_POINTS)} saldo`}
              right={
                <Button size="sm" variant="secondary" disabled={!canRedeem || redeeming} onClick={handleRedeem}>
                  {redeeming ? "Bezig…" : "Inwisselen"}
                </Button>
              }
            />
          </>
        )}

        <SectionLabel>Vrienden uitnodigen</SectionLabel>
        <Card variant="surface" padding={16}>
          <div className="flex items-center gap-3">
            <span className="text-accent flex flex-shrink-0"><Share2 size={20} /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold">Jouw code: {referral?.referralCode ?? "…"}</div>
              <div className="text-[13px] text-text-secondary mt-0.5">
                €5 voor jou én je vriend na hun eerste boeking
                {referral && referral.referredCount > 0 ? ` · ${referral.referredCount} aangemeld` : ""}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={handleCopyCode}>
              {copied ? "Gekopieerd" : "Kopieer"}
            </Button>
          </div>
        </Card>

        <SectionLabel>Geschiedenis</SectionLabel>
        {!loading && ledger.length === 0 ? (
          <EmptyState icon={<WalletIcon size={28} />} title="Nog geen transacties" sub="Waardeer op om te beginnen." />
        ) : (
          <div>
            {ledger.map((entry) => (
              <Row
                key={entry.id}
                title={LEDGER_LABELS[entry.entryType]}
                sub={timeAgo(entry.createdAt)}
                right={<span className="text-[15px] font-semibold text-success">+€{euro(entry.amountCents)}</span>}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
