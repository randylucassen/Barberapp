"use client";

interface RadioProps {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Radio({ checked = false, onChange, label, disabled = false }: RadioProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(true)}
      className={`inline-flex items-center gap-3 min-h-[44px] font-sans focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        disabled ? "cursor-default opacity-40" : "cursor-pointer"
      }`}
    >
      <span
        className={[
          "w-6 h-6 rounded-full box-border bg-white transition-[border] duration-fast ease-groomy",
          checked ? "border-[7px] border-accent" : "border border-border",
        ].join(" ")}
      />
      {label && <span className="text-[17px]">{label}</span>}
    </button>
  );
}
