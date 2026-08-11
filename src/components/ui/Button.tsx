"use client";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost";
type Size = "lg" | "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-white active:bg-[#2A2A2A]",
  accent: "bg-accent text-white active:bg-accent-dark",
  secondary: "bg-surface text-text-primary active:bg-[#EFEFEF]",
  ghost: "bg-transparent text-text-primary active:bg-surface",
};

const sizeClasses: Record<Size, string> = {
  lg: "h-ctrl-lg px-6 text-[17px]",
  md: "h-ctrl-md px-5 text-[16px]",
  sm: "h-ctrl-sm px-3.5 text-[14px]",
};

export function Button({
  variant = "primary",
  size = "lg",
  full = false,
  disabled = false,
  icon = null,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        full ? "flex w-full" : "inline-flex",
        "items-center justify-center gap-2 rounded-md font-semibold tracking-[-0.01em]",
        "transition-all duration-fast ease-groomy active:scale-[.98]",
        disabled ? "cursor-default opacity-40" : "cursor-pointer",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
