"use client";
import { CreditCard, Scissors, WifiOff } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button, NavBar } from "@/components/ui";
import { EmptyState } from "@/components/shared";

const MAP: Record<string, { icon: React.ReactNode; title: string; sub: string; cta: string }> = {
  nobarbers: {
    icon: <Scissors size={28} />,
    title: "Geen barbers beschikbaar",
    sub: "Er is nu niemand vrij in jouw buurt. Probeer het later of plan vooruit.",
    cta: "Plan vooruit",
  },
  payment: {
    icon: <CreditCard size={28} />,
    title: "Betaling mislukt",
    sub: "Je bank heeft de betaling geweigerd. Probeer het opnieuw of kies een andere methode.",
    cta: "Probeer opnieuw",
  },
  offline: {
    icon: <WifiOff size={28} />,
    title: "Geen verbinding",
    sub: "Controleer je internetverbinding en probeer het opnieuw.",
    cta: "Opnieuw laden",
  },
};

export default function ErrorStatePage() {
  const router = useRouter();
  const params = useParams<{ kind: string }>();
  const e = MAP[params.kind] ?? MAP.offline;

  return (
    <div className="flex flex-col h-full">
      <NavBar onBack={() => router.push("/klant/home")} />
      <EmptyState icon={e.icon} title={e.title} sub={e.sub} action={<Button size="md" onClick={() => router.push("/klant/home")}>{e.cta}</Button>} />
    </div>
  );
}
