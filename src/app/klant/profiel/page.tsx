"use client";
import { Bell, ChevronRight, CreditCard, FileText, MapPin, Wallet as WalletIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NavBar, Switch } from "@/components/ui";
import { Avatar, Row } from "@/components/shared";
import { createClient } from "@/lib/supabase/client";
import { getWallet } from "@/lib/supabase/queries";
import { euro } from "@/lib/pricing";

export default function ProfilePage() {
  const router = useRouter();
  const [n, setN] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [walletBalanceCents, setWalletBalanceCents] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setName((data.user.user_metadata?.full_name as string) ?? "");
      setEmail(data.user.email ?? "");
      const wallet = await getWallet(supabase, data.user.id);
      setWalletBalanceCents(wallet?.balanceCents ?? 0);
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      <NavBar title="Profiel" />
      <div className="px-5 pt-5 flex-1 overflow-y-auto no-scrollbar">
        <div className="flex gap-3.5 items-center">
          <Avatar name={name} size={64} dark />
          <div>
            <div className="text-[20px] font-bold tracking-[-0.01em]">{name}</div>
            <div className="text-[13px] text-text-secondary mt-0.5">{email}</div>
          </div>
        </div>
        <div className="mt-6">
          <Row
            left={<span className="text-primary"><WalletIcon size={20} /></span>}
            title="Wallet"
            sub={walletBalanceCents !== null ? `€${euro(walletBalanceCents)} saldo` : "…"}
            right={null}
            onClick={() => router.push("/klant/wallet")}
          />
          <Row
            left={<span className="text-primary"><MapPin size={20} /></span>}
            title="Adres"
            sub="Standaardadres voor boekingen"
            right={<ChevronRight size={18} />}
            onClick={() => router.push("/klant/adres")}
          />
          <Row left={<span className="text-primary"><CreditCard size={20} /></span>} title="Betaalmethoden" sub="Binnenkort beschikbaar" right={null} />
          <Row left={<span className="text-primary"><Bell size={20} /></span>} title="Notificaties" right={<Switch checked={n} onChange={setN} />} />
          <Row
            left={<span className="text-primary"><FileText size={20} /></span>}
            title="Instellingen"
            sub="Account, privacy, uitloggen"
            right={null}
            onClick={() => router.push("/klant/instellingen")}
          />
        </div>
        <div className="h-4" />
      </div>
    </div>
  );
}
