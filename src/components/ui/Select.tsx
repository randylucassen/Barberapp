"use client";
import { ChevronDown } from "lucide-react";
import { SelectHTMLAttributes } from "react";

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Option[];
  placeholder?: string;
}

export function Select({ label, options, placeholder, className = "", value, ...rest }: SelectProps) {
  return (
    <label className={`flex flex-col gap-1.5 font-sans ${className}`}>
      {label && <span className="text-[13px] font-semibold text-text-primary">{label}</span>}
      <span className="relative flex items-center h-ctrl-md rounded-md bg-surface transition-shadow duration-fast ease-groomy focus-within:shadow-focus-ring">
        <select
          value={value}
          className={`appearance-none w-full h-full pl-4 pr-10 border-none outline-none bg-transparent font-sans text-[17px] ${
            value ? "text-text-primary" : "text-text-tertiary"
          }`}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 text-text-tertiary" size={18} />
      </span>
    </label>
  );
}
