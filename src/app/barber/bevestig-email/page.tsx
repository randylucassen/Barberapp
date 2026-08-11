"use client";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function BarberConfirmEmailPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col h-full items-center justify-center px-7 text-center">
      <div className="w-[72px] h-[72px] rounded-full bg-accent-soft text-accent flex items-center justify-center">
        <Mail size={32} />
      </div>
      <div className="text-[22px] font-bold tracking-[-0.01em] mt-5">Check je inbox</div>
      <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
        We hebben een bevestigingslink gestuurd. Klik erop om je account te
        activeren en je aanmelding als barber te starten.
      </div>
      <div className="mt-7 w-full">
        <Button full variant="secondary" onClick={() => router.push("/barber/login")}>Terug naar inloggen</Button>
      </div>
    </div>
  );
}
