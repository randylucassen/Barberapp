"use client";
import { Check, ChevronRight } from "lucide-react";
import { ReactNode } from "react";

interface UploadTileProps {
  icon: ReactNode;
  title: string;
  sub: string;
  done?: boolean;
  onClick?: () => void;
}

export function UploadTile({ icon, title, sub, done = false, onClick }: UploadTileProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3.5 border rounded-md px-4 py-3.5 cursor-pointer ${
        done ? "border-accent" : "border-border"
      }`}
    >
      <div
        className={`w-11 h-11 rounded-[12px] flex items-center justify-center flex-shrink-0 ${
          done ? "bg-accent-soft text-accent" : "bg-surface text-text-secondary"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="text-[13px] text-text-secondary mt-px">{sub}</div>
      </div>
      {done ? <Check size={20} className="text-accent" /> : <ChevronRight size={18} className="text-text-tertiary" />}
    </div>
  );
}
