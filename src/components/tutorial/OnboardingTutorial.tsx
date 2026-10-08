"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { markTutorialSeen } from "@/lib/supabase/queries";

export interface TutorialStep {
  // DOM-id van het uit te lichten element — ontbreekt bij een
  // welkomst-/afsluitstap (gecentreerde kaart, geen spotlight).
  targetId?: string;
  title: string;
  body: string;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Generieke spotlight-rondleiding voor klant-home/barber-dashboard — zie
// het eerder goedgekeurde voorbeeld (KPPRTJE Rondleiding-artifact) voor
// het ontwerp. `position:fixed` t.o.v. de viewport (niet t.o.v.
// PhoneShell's desktop-telefoonkader) — op een echt toestel is dat
// precies hetzelfde, PhoneShell's kader is puur een desktop-devgemak.
export function OnboardingTutorial({
  steps,
  userId,
  onFinish,
}: {
  steps: TutorialStep[];
  userId: string;
  // Aangeroepen zodra de rondleiding sluit (Overslaan of de laatste
  // "Begrepen") — het aanroepende scherm moet hiermee zélf meteen zijn
  // tutorialSeenAt-state bijwerken (niet wachten op de eerstvolgende
  // poll/focus-herlading). Zonder dit blijft deze component gemount met
  // resolvedSteps=[] totdat de volgende natuurlijke herlading de echte
  // (niet-null) waarde ophaalt — klik je vóór die tijd nogmaals op
  // "Rondleiding opnieuw bekijken", dan wordt deze instantie hergebruikt
  // i.p.v. vers gemount, en blijft hij dus leeg staan (gemeld door de
  // gebruiker: de 2e keer werkte het niet totdat er eerst ergens anders
  // heen genavigeerd werd, wat alsnog een unmount forceerde).
  onFinish?: () => void;
}) {
  const [resolvedSteps, setResolvedSteps] = useState<TutorialStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const scrollAttempts = useRef(0);

  useEffect(() => {
    // Een stap waarvan het doelwit (nog) niet in de DOM staat — bv. "Zo
    // ziet een aanvraag eruit" zonder een live openstaande aanvraag — valt
    // hier stil weg i.p.v. een kapotte/lege spotlight te tonen.
    setResolvedSteps(steps.filter((s) => !s.targetId || document.getElementById(s.targetId)));
    setViewport({ w: window.innerWidth, h: window.innerHeight });
  }, [steps]);

  useEffect(() => {
    function measure() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!resolvedSteps) return;
      const step = resolvedSteps[stepIndex];
      const el = step?.targetId ? document.getElementById(step.targetId) : null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Buiten beeld (bv. onder een dispute-/voltooide-boeking-balk, of
      // simpelweg verder naar beneden gescrold binnen de eigen scrollbare
      // inhoud) -> in beeld scrollen en op het eerstvolgende animatieframe
      // opnieuw meten, anders klopt de spotlight niet met wat de klant
      // daadwerkelijk ziet. Begrensd op een paar pogingen, voor het geval
      // een element om wat voor reden dan ook nooit volledig in beeld komt
      // (bv. hoger dan de viewport zelf) — dan gewoon de laatste meting
      // gebruiken i.p.v. voor altijd te blijven proberen.
      if ((r.top < 0 || r.bottom > window.innerHeight) && scrollAttempts.current < 6) {
        scrollAttempts.current += 1;
        el.scrollIntoView({ block: "center" });
        requestAnimationFrame(measure);
        return;
      }
      setRect({ left: r.left - 7, top: r.top - 7, width: r.width + 14, height: r.height + 14 });
    }
    scrollAttempts.current = 0;
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [resolvedSteps, stepIndex]);

  if (!resolvedSteps || resolvedSteps.length === 0) return null;

  const step = resolvedSteps[stepIndex];
  const isLast = stepIndex === resolvedSteps.length - 1;
  const { w: vw, h: vh } = viewport;
  const hole = rect ?? { left: vw / 2, top: vh / 2, width: 0, height: 0 };

  async function finish() {
    setResolvedSteps([]);
    onFinish?.();
    const supabase = createClient();
    await markTutorialSeen(supabase, userId);
  }
  function next() {
    if (isLast) finish();
    else setStepIndex((i) => i + 1);
  }
  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const tipWidth = Math.min(336, vw - 24);
  let tipLeft = hole.left + hole.width / 2 - tipWidth / 2;
  tipLeft = Math.max(12, Math.min(tipLeft, vw - tipWidth - 12));
  let tipTop: number;
  if (!rect) {
    tipTop = vh / 2 - 130;
  } else {
    const spaceBelow = vh - (hole.top + hole.height);
    tipTop = spaceBelow > 260 ? hole.top + hole.height + 16 : Math.max(12, hole.top - 276);
  }

  const scrimClass = "fixed bg-[rgba(10,16,15,0.58)] cursor-pointer";

  return (
    <div className="fixed inset-0 z-[200]">
      <div className={scrimClass} style={{ left: 0, top: 0, width: "100%", height: Math.max(0, hole.top) }} onClick={next} />
      <div
        className={scrimClass}
        style={{ left: 0, top: hole.top + hole.height, width: "100%", height: Math.max(0, vh - (hole.top + hole.height)) }}
        onClick={next}
      />
      <div className={scrimClass} style={{ left: 0, top: hole.top, width: Math.max(0, hole.left), height: hole.height }} onClick={next} />
      <div
        className={scrimClass}
        style={{ left: hole.left + hole.width, top: hole.top, width: Math.max(0, vw - (hole.left + hole.width)), height: hole.height }}
        onClick={next}
      />
      {rect && (
        <div
          className="fixed rounded-[16px] border-2 border-accent cursor-pointer"
          style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height, boxShadow: "0 0 0 5px rgba(14,165,164,.22)" }}
          onClick={next}
        />
      )}
      <div
        className="fixed bg-white rounded-lg p-5 shadow-[0_20px_40px_-18px_rgba(10,16,15,.45)]"
        style={{ left: tipLeft, top: tipTop, width: tipWidth }}
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-accent-dark">
          Stap {stepIndex + 1} van {resolvedSteps.length}
        </div>
        <div className="text-[18px] font-extrabold tracking-[-0.01em] mt-1.5">{step.title}</div>
        <div className="text-[14px] text-text-secondary mt-2 leading-[21px]">{step.body}</div>
        <div className="flex gap-1.5 mt-4">
          {resolvedSteps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full ${i === stepIndex ? "w-3.5 bg-accent" : "w-1.5 bg-border"}`} />
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          {stepIndex > 0 && (
            <button type="button" onClick={back} className="h-10 px-4 rounded-md text-[14px] font-semibold text-text-secondary">
              Terug
            </button>
          )}
          <button type="button" onClick={next} className="flex-1 h-10 rounded-md bg-primary text-white text-[14px] font-bold">
            {isLast ? "Begrepen" : "Volgende"}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={finish}
        className="fixed top-4 right-4 z-[210] flex items-center gap-1.5 rounded-pill bg-primary text-white text-[12.5px] font-bold px-3.5 py-2 shadow-[0_1px_2px_rgba(17,17,17,.04),0_10px_24px_-14px_rgba(17,17,17,.18)]"
      >
        Overslaan
      </button>
    </div>
  );
}
