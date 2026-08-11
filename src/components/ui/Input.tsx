"use client";
import { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leading?: ReactNode;
}

export function Input({ label, hint, error, leading, className = "", ...rest }: InputProps) {
  return (
    <label className={`flex flex-col gap-1.5 font-sans ${className}`}>
      {label && <span className="text-[13px] font-semibold text-text-primary">{label}</span>}
      <span
        className={[
          "flex items-center gap-2.5 h-ctrl-md px-4 rounded-md bg-surface",
          "transition-shadow duration-fast ease-groomy focus-within:shadow-focus-ring",
          error ? "border border-error" : "border border-transparent",
        ].join(" ")}
      >
        {leading && <span className="flex text-text-tertiary">{leading}</span>}
        <input
          className="flex-1 min-w-0 border-none outline-none bg-transparent font-sans text-[17px] text-text-primary placeholder:text-text-tertiary"
          {...rest}
        />
      </span>
      {(error || hint) && (
        <span className={`text-[13px] ${error ? "text-error" : "text-text-secondary"}`}>{error || hint}</span>
      )}
    </label>
  );
}
