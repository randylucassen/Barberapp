"use client";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";

interface NavBarProps {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  transparent?: boolean;
}

export function NavBar({ title = "", onBack, right = null, transparent = false }: NavBarProps) {
  return (
    <div
      className={[
        "flex items-center gap-2 h-[52px] px-2 sticky top-0 z-10 font-sans",
        transparent ? "bg-transparent" : "bg-white/85 backdrop-blur-xl border-b border-border",
      ].join(" ")}
    >
      <span className="w-11 flex justify-center">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Terug"
            className="w-9 h-9 flex items-center justify-center bg-transparent border-none cursor-pointer text-text-primary"
          >
            <ChevronLeft size={22} />
          </button>
        )}
      </span>
      <span className="flex-1 text-center text-[17px] font-semibold tracking-[-0.01em]">{title}</span>
      <span className="w-11 flex justify-center">{right}</span>
    </div>
  );
}
