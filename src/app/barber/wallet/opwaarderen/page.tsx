"use client";
import { useRouter } from "next/navigation";
import { TopupCheckout } from "@/components/wallet/TopupCheckout";

export default function BarberWalletOpwaarderenPage() {
  const router = useRouter();
  return <TopupCheckout onBack={() => router.back()} successPath="/barber/wallet/opwaarderen/succes" />;
}
