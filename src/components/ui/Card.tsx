"use client";
import { MouseEventHandler, ReactNode } from "react";

type Variant = "surface" | "outline" | "inverse";

interface CardProps {
  variant?: Variant;
  padding?: number;
  onClick?: MouseEventHandler<HTMLDivElement>;
  children?: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  surface: "bg-surface",
  outline: "bg-white border border-border",
  inverse: "bg-primary text-white",
};

export function Card({ variant = "surface", padding = 16, onClick, children, className = "" }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{ padding }}
      className={[
        "rounded-lg font-sans transition-transform duration-fast ease-groomy",
        onClick ? "cursor-pointer active:scale-[.99]" : "",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
