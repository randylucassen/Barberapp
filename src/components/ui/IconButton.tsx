"use client";
import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: number;
  variant?: Variant;
  label: string;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-white active:bg-[#2A2A2A]",
  secondary: "bg-surface text-text-primary active:bg-[#EFEFEF]",
  ghost: "bg-transparent text-text-primary active:bg-surface",
};

export function IconButton({
  size = 44,
  variant = "secondary",
  disabled = false,
  label,
  children,
  className = "",
  style,
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      style={{ width: size, height: size, ...style }}
      className={[
        "inline-flex items-center justify-center rounded-pill",
        "transition-all duration-fast ease-groomy active:scale-[.96]",
        disabled ? "cursor-default opacity-40" : "cursor-pointer",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}
