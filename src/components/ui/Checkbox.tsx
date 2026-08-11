"use client";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Checkbox({ checked = false, onChange, label, disabled = false }: CheckboxProps) {
  const toggle = () => !disabled && onChange?.(!checked);
  return (
    <span className={`inline-flex items-center gap-3 min-h-[44px] font-sans ${disabled ? "opacity-40" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={toggle}
        className={[
          "w-6 h-6 rounded-[8px] inline-flex items-center justify-center transition-colors duration-fast ease-groomy",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          checked ? "bg-accent border border-accent" : "bg-white border border-border",
          disabled ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
      >
        {checked && <Check size={14} strokeWidth={3} className="text-white" />}
      </button>
      {label && (
        <span onClick={toggle} className={disabled ? "" : "cursor-pointer"}>
          <span className="text-[17px]">{label}</span>
        </span>
      )}
    </span>
  );
}
