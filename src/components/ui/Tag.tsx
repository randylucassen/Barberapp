"use client";
import { ReactNode } from "react";

interface TagProps {
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

export function Tag({ selected = false, onClick, children }: TagProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill font-sans text-[14px] font-medium cursor-pointer",
        "transition-colors duration-fast ease-groomy border",
        selected ? "bg-primary text-white border-primary" : "bg-white text-text-primary border-border",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
