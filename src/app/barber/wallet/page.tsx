"use client";
import { useRouter } from "next/navigation";
import { WalletOverview } from "@/components/wallet/WalletOverview";

export default function BarberWalletPage() {
  const router = useRouter();
  return (
    <WalletOverview onBack={() => router.back()} topupPath="/barber/wallet/opwaarderen" showLoyalty={false} />
  );
}
