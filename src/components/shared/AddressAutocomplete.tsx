"use client";
import { ReactNode, useEffect, useRef, useState } from "react";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  leading?: ReactNode;
  className?: string;
  inputClassName?: string;
}

// Losstaand van de gewone <Input>-primitive — deze heeft een eigen
// relative/absolute wrapper nodig voor de suggestielijst, en wordt op
// twee plekken met verschillende omringende styling gebruikt
// (klant/home, klant/boeking), dus bewust géén vaste vormgeving
// opgelegd: de aanroeper geeft leading-icoon/className zelf mee.
export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  leading,
  className = "",
  inputClassName = "",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Een geselecteerde suggestie verandert `value` net als getypte tekst
  // — zonder deze guard triggerde dat de fetch hieronder opnieuw, die
  // ~350ms later de net-gesloten dropdown weer open zette (leek dan
  // alsof de eerste klik niks deed en je nog een keer moest klikken).
  const skipNextFetchRef = useRef(false);

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/address-suggest?q=${encodeURIComponent(value)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((labels: string[]) => {
          setSuggestions(labels);
          setOpen(labels.length > 0);
        })
        .catch(() => setSuggestions([]));
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function select(label: string) {
    skipNextFetchRef.current = true;
    onChange(label);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {leading}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-md shadow-[0_4px_16px_rgba(0,0,0,.12)] border border-border z-20 overflow-hidden">
          {suggestions.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => select(label)}
              className="w-full text-left px-4 py-2.5 text-[14px] leading-snug text-text-primary hover:bg-surface border-b border-border-soft last:border-0"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
