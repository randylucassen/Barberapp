"use client";
import { ReactNode } from "react";

export interface TabItem {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
}

interface TabBarProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
}

export function TabBar({ items, value, onChange }: TabBarProps) {
  return (
    <div className="flex h-16 bg-white/85 backdrop-blur-xl border-t border-border font-sans">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`flex-1 flex flex-col items-center justify-center gap-[3px] border-none bg-transparent cursor-pointer ${
              active ? "text-text-primary" : "text-text-tertiary"
            }`}
          >
            {it.icon}
            <span className={`text-[11px] ${active ? "font-semibold" : "font-medium"}`}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
