"use client";

interface SwitchProps {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}

export function Switch({ checked = false, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={[
        "inline-flex w-[51px] h-[31px] p-0.5 rounded-pill transition-colors duration-med ease-groomy",
        checked ? "bg-accent" : "bg-border",
        disabled ? "cursor-default opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "w-[27px] h-[27px] rounded-full bg-white transition-transform duration-med ease-groomy",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}
