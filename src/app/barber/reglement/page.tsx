"use client";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/ui";
import { ReglementContent } from "@/components/shared";

export default function BarberReglementPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col h-full">
      <NavBar title="Regels en richtlijnen" onBack={() => router.push("/barber/profiel")} />
      <div className="px-5 pt-2 pb-6 flex-1 overflow-y-auto no-scrollbar">
        <ReglementContent />
      </div>
    </div>
  );
}
