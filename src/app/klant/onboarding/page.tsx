"use client";
import { Scissors } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

const SLIDES = [
  { t: "Een barber, waar jij bent", s: "Boek een professionele barber op jouw locatie. Thuis, op kantoor, waar dan ook." },
  { t: "Betaal veilig achteraf", s: "Je betaling staat veilig vast en wordt pas vrijgegeven na afloop." },
  { t: "Volg je barber live", s: "Zie precies wanneer je barber aankomt, net als een taxi." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-5 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => router.push("/klant/login")}>Overslaan</Button>
      </div>
      <div className="flex-1 flex flex-col justify-center px-7">
        <div className="w-[72px] h-[72px] rounded-[22px] bg-primary text-accent flex items-center justify-center mb-8">
          <Scissors size={32} />
        </div>
        <div className="text-[32px] leading-[38px] font-bold tracking-[-0.02em]">{SLIDES[i].t}</div>
        <div className="text-[16px] leading-6 text-text-secondary mt-3">{SLIDES[i].s}</div>
      </div>
      <div className="px-5 pb-2">
        <div className="flex gap-1.5 justify-center mb-5">
          {SLIDES.map((_, d) => (
            <span
              key={d}
              className={`h-1.5 rounded-full transition-all duration-200 ${d === i ? "w-5 bg-primary" : "w-1.5 bg-border"}`}
            />
          ))}
        </div>
        <Button
          full
          variant={last ? "accent" : "primary"}
          onClick={() => (last ? router.push("/klant/login") : setI(i + 1))}
        >
          {last ? "Aan de slag" : "Volgende"}
        </Button>
      </div>
    </div>
  );
}
