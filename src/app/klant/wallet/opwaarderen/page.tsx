"use client";
import { useRouter } from "next/navigation";
import { TopupCheckout } from "@/components/wallet/TopupCheckout";

export default function KlantWalletOpwaarderenPage() {
  const router = useRouter();
  return <TopupCheckout onBack={() => router.back()} successPath="/klant/wallet/opwaarderen/succes" />;
}
