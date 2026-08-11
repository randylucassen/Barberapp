"use client";
import { useRouter } from "next/navigation";
import { WalletOverview } from "@/components/wallet/WalletOverview";

export default function KlantWalletPage() {
  const router = useRouter();
  return (
    <WalletOverview onBack={() => router.back()} topupPath="/klant/wallet/opwaarderen" showLoyalty />
  );
}
