"use client";
import { ReactNode, useState } from "react";

interface TooltipProps {
  label: string;
  children?: ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className="relative inline-flex"
    >
      {children}
      {visible && (
        <span className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary text-white font-sans text-[13px] font-medium px-3 py-1.5 rounded-sm z-50">
          {label}
        </span>
      )}
    </span>
  );
}
