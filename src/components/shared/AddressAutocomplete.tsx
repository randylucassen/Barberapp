"use client";
import { LocateFixed } from "lucide-react";
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
// drie plekken met verschillende omringende styling gebruikt
// (klant/home, klant/boeking, klant/adres), dus bewust géén vaste
// vormgeving opgelegd: de aanroeper geeft leading-icoon/className zelf
// mee. `flex items-center` staat wel altijd aan (naast wat de aanroeper
// meegeeft) zodat de trailing locatie-knop hieronder overal netjes naast
// de input past, ook bij een simpele `className="flex-1"`-aanroep.
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
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Een geselecteerde suggestie verandert `value` net als getypte tekst
  // — zonder deze guard triggerde dat de fetch hieronder opnieuw, die
  // ~350ms later de net-gesloten dropdown weer open zette (leek dan
  // alsof de eerste klik niks deed en je nog een keer moest klikken).
  // Ook gebruikt na "huidige locatie" hieronder, om dezelfde reden.
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

  // Vraagt eenmalig locatietoestemming via de browser (geen aparte
  // Supabase/backend-opslag nodig — puur een gemaksinvoer voor dit ene
  // veld) en zet het geocodeerde adres in hetzelfde veld, alsof het
  // getypt was. PDOK's reverse-endpoint (via /api/reverse-geocode),
  // dezelfde bron als de gewone suggesties tijdens typen.
  function useCurrentLocation() {
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError("Je browser ondersteunt geen locatiebepaling.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(`/api/reverse-geocode?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
          const data = res.ok ? ((await res.json()) as { address: string | null }) : { address: null };
          if (data.address) {
            skipNextFetchRef.current = true;
            onChange(data.address);
            setOpen(false);
            setSuggestions([]);
          } else {
            setLocError("Geen adres gevonden bij je locatie.");
          }
        } catch {
          setLocError("Geen adres gevonden bij je locatie.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocError(err.code === err.PERMISSION_DENIED ? "Locatietoestemming geweigerd." : "Kon je locatie niet bepalen.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div ref={containerRef} className={`relative flex items-center ${className}`}>
      {leading}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      <button
        type="button"
        aria-label="Gebruik huidige locatie"
        onClick={useCurrentLocation}
        disabled={locating}
        className={`shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-text-tertiary hover:text-accent hover:bg-black/5 transition-colors ${locating ? "animate-pulse" : ""}`}
      >
        <LocateFixed size={16} />
      </button>
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
      {locError && (
        <div className="absolute left-0 right-0 top-full mt-1.5 text-[12px] text-error-text bg-error-soft rounded-md px-3 py-2 z-20">
          {locError}
        </div>
      )}
    </div>
  );
}
