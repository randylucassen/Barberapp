"use client";
import { ReactNode, useEffect, useId, useRef } from "react";

interface DialogProps {
  open: boolean;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, title, children, actions, onClose }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // Focus het paneel zelf bij openen — zonder dit blijft de focus op de
    // knop die de dialog opende, buiten beeld van wat er nu op het scherm
    // gebeurt (schermlezers kondigen de dialog dan ook niet aan).
    panelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Eenvoudige focus-trap: Tab/Shift+Tab blijven binnen het paneel
      // cirkelen i.p.v. door te lopen naar de pagina erachter.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-6">
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className="w-full max-w-[340px] bg-white rounded-xl p-6 font-sans outline-none"
      >
        {title && (
          <div id={titleId} className="text-[20px] font-bold tracking-[-0.01em] mb-2">
            {title}
          </div>
        )}
        <div className="text-[15px] leading-[21px] text-text-secondary">{children}</div>
        {actions && <div className="flex flex-col gap-2 mt-5">{actions}</div>}
      </div>
    </div>
  );
}
