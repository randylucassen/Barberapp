"use client";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function CancelledPage() {
  const router = useRouter();
  return (
    <div className="flex flex-col h-full items-center justify-center px-7 text-center">
      <div className="w-[88px] h-[88px] rounded-full bg-surface text-text-secondary flex items-center justify-center">
        <X size={36} />
      </div>
      <div className="text-[26px] font-bold tracking-[-0.02em] mt-6">Boeking geannuleerd</div>
      <div className="text-[15px] text-text-secondary mt-2 leading-[22px]">
        Je aanvraag is geannuleerd. Er is nog geen betaling in rekening gebracht.
      </div>
      <div className="mt-8 w-full">
        <Button full onClick={() => router.push("/klant/home")}>Naar home</Button>
      </div>
    </div>
  );
}
