import Link from "next/link";
import { Scissors } from "lucide-react";
import { PhoneShell } from "@/components/shared";
import { Button } from "@/components/ui";

// Simpele app-kiezer voor lokale ontwikkeling: in productie leidt de klant-
// en barber-app naar losse (sub)domeinen of losse app store-builds. Een
// ingelogde gebruiker komt hier nooit — middleware stuurt die al door naar
// zijn eigen home voordat deze pagina rendert.
export default function RootPage() {
  return (
    <PhoneShell>
      <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
        <div className="w-[72px] h-[72px] rounded-[22px] bg-primary text-accent flex items-center justify-center mb-8">
          <Scissors size={32} />
        </div>
        <div className="text-[28px] font-bold tracking-[-0.02em]">Groomy</div>
        <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
          Kies welke app je wilt bekijken.
        </div>
        <div className="mt-8 w-full flex flex-col gap-3">
          <Link href="/klant/onboarding" className="w-full">
            <Button full variant="accent">Klant-app</Button>
          </Link>
          <Link href="/barber/login" className="w-full">
            <Button full variant="secondary">Barber-app</Button>
          </Link>
        </div>
      </div>
    </PhoneShell>
  );
}
