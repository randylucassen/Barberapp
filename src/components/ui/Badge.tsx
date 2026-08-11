import { ReactNode } from "react";

type Variant = "neutral" | "accent" | "success" | "error" | "inverse";

interface BadgeProps {
  variant?: Variant;
  children?: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  neutral: "bg-surface text-text-secondary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success-text",
  error: "bg-error-soft text-error",
  inverse: "bg-primary text-white",
};

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-pill font-sans text-[12px] font-semibold tracking-[0.01em]",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
