import { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[13px] font-semibold text-text-tertiary uppercase tracking-[0.04em] mt-5 mb-0.5">
      {children}
    </div>
  );
}
