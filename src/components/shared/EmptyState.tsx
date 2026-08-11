import { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  sub: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, sub, action }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-10 text-center">
      <div className="w-16 h-16 rounded-full bg-surface text-text-tertiary flex items-center justify-center">
        {icon}
      </div>
      <div className="text-[18px] font-semibold tracking-[-0.01em] mt-4">{title}</div>
      <div className="text-[14px] text-text-secondary mt-1.5 leading-5">{sub}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
