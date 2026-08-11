import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-7 text-center bg-white">
      <div className="w-16 h-16 rounded-full bg-surface text-text-tertiary flex items-center justify-center">
        <MapPinOff size={28} />
      </div>
      <div className="text-[18px] font-semibold tracking-[-0.01em] mt-4">
        Pagina niet gevonden
      </div>
      <div className="text-[14px] text-text-secondary mt-1.5 leading-5 max-w-xs">
        Deze pagina bestaat niet (meer). Controleer de link of ga terug naar
        de homepage.
      </div>
      <div className="mt-5">
        <Link href="/">
          <Button size="md">Naar home</Button>
        </Link>
      </div>
    </div>
  );
}
