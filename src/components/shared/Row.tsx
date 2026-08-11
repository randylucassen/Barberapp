"use client";
import { KeyboardEventHandler, MouseEventHandler, ReactNode } from "react";

interface RowProps {
  left?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Row({ left, title, sub, right, onClick }: RowProps) {
  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e as unknown as Parameters<MouseEventHandler<HTMLDivElement>>[0]);
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`flex items-center gap-3.5 py-3.5 border-b border-border-soft ${
        onClick ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" : ""
      }`}
    >
      {left}
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-semibold tracking-[-0.01em]">{title}</div>
        {sub && <div className="text-[13px] text-text-secondary mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
