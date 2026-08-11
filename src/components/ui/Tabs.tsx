"use client";

interface TabsItem {
  key: string;
  label: string;
}

interface TabsProps {
  items: TabsItem[];
  value: string;
  onChange: (key: string) => void;
}

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 p-1 bg-surface rounded-md font-sans">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={[
              "flex-1 h-[38px] border-none rounded-[10px] cursor-pointer font-sans text-[15px] font-semibold",
              "transition-colors duration-fast ease-groomy",
              active ? "bg-white text-text-primary shadow-[inset_0_0_0_1px_#E5E7EB]" : "bg-transparent text-text-secondary",
            ].join(" ")}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
