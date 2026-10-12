// Gedeelde inhoud voor "Regels en richtlijnen" — op verzoek
// samengevat uit de regels die dit project gaandeweg kreeg
// (annuleringskosten, no-show-vensters, geschillenvensters, servicekosten,
// uitbetaling). Bewust ÉÉN component, gerenderd vanuit zowel
// klant/reglement/page.tsx als barber/reglement/page.tsx — beide partijen
// zien hier ALTIJD allebei de secties, ongeacht vanuit welke appkant je
// 'm opent (expliciet gevraagd: transparantie over en weer, geen
// rol-gating). Houd de cijfers hier in sync met de daadwerkelijke
// code als die ooit wijzigen: 50%/1u (booking-timing.ts), 60min/20min
// (migraties 0035/0063), 15%/€25 (pricing.ts/0041), 24u (0009).

interface Rule {
  title: string;
  body: string;
}

interface Section {
  label: string;
  rules: Rule[];
}

export const KLANT_SECTIONS: Section[] = [
  {
    label: "Annuleren",
    rules: [
      {
        title: "Gratis annuleren",
        body: "Tot 1 uur vóór een geplande afspraak, of tot je barber onderweg is — daarna kosteloos.",
      },
      {
        title: "Te laat annuleren",
        body: "50% van het dienstbedrag blijft verschuldigd (servicekosten altijd volledig). De rest gaat als compensatie naar je barber.",
      },
    ],
  },
  {
    label: "Betalen",
    rules: [
      {
        title: "Snelste beschikbare barber",
        body: "Je betaalt pas zodra een barber je aanvraag heeft geclaimd én jij de prijs hebt bevestigd.",
      },
      {
        title: "Vooruit gepland",
        body: "Je betaalt pas nadat een barber heeft geaccepteerd — binnen 24 uur, anders vervalt de aanvraag automatisch en kosteloos.",
      },
    ],
  },
  {
    label: "Als je barber niet komt opdagen",
    rules: [
      {
        title: "Volledig terugbetaald",
        body: "Gepland: als je barber niet binnen 60 minuten na de afgesproken tijd vertrekt. Snelste beschikbare barber: binnen 20 minuten na accepteren. Automatisch, geen actie nodig.",
      },
    ],
  },
  {
    label: "Problemen melden",
    rules: [
      {
        title: "Binnen 24 uur na afronding",
        body: "Blokkeert de uitbetaling aan je barber totdat het is opgelost.",
      },
      {
        title: "Afspraak zit vast",
        body: 'Meldt je barber 2 uur of langer niets meer na "aangekomen"/"bezig"? Dan kun je ook dan een melding maken.',
      },
    ],
  },
];

export const BARBER_SECTIONS: Section[] = [
  {
    label: "Op tijd vertrekken",
    rules: [
      {
        title: "Deadline",
        body: 'Gepland: binnen 60 minuten na de afgesproken tijd op "Start rit". Snelste beschikbare barber: binnen 20 minuten na accepteren.',
      },
      {
        title: "Bij een gemiste deadline",
        body: "De afspraak wordt automatisch geannuleerd, de klant volledig terugbetaald, en jij krijgt een waarschuwing.",
      },
      {
        title: "2e waarschuwing",
        body: "Je account wordt automatisch geschorst.",
      },
    ],
  },
  {
    label: "Prijzen & uitbetaling",
    rules: [
      {
        title: "Minimumprijs",
        body: "Elke actieve dienst moet minstens €25,00 kosten.",
      },
      {
        title: "Servicekosten",
        body: "KPPRTJE! houdt 15% servicekosten in op elke boeking.",
      },
      {
        title: "Wanneer je betaald krijgt",
        body: "24 uur na afronding, tenzij de klant binnen die 24 uur een probleem meldt.",
      },
    ],
  },
  {
    label: "Annuleren",
    rules: [
      {
        title: "Jij annuleert een bevestigde afspraak",
        body: "De klant krijgt altijd het volledige bedrag terug, ongeacht het tijdstip.",
      },
    ],
  },
];

function RuleCard({ rule }: { rule: Rule }) {
  return (
    <div className="bg-surface rounded-md px-3.5 py-3 mb-2">
      <div className="text-[13.5px] font-semibold text-text-primary">{rule.title}</div>
      <div className="text-[12.5px] text-text-secondary leading-[18px] mt-0.5">{rule.body}</div>
    </div>
  );
}

function RoleBlock({ title, sections }: { title: string; sections: Section[] }) {
  return (
    <div>
      <div className="flex items-center gap-2 mt-2 mb-2.5">
        <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
        <span className="text-[16px] font-extrabold tracking-[-0.01em]">{title}</span>
      </div>
      {sections.map((section) => (
        <div key={section.label}>
          <div className="text-[11px] font-bold text-text-tertiary uppercase tracking-[0.04em] mt-3.5 mb-2">
            {section.label}
          </div>
          {section.rules.map((rule) => (
            <RuleCard key={rule.title} rule={rule} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReglementContent() {
  return (
    <div>
      <RoleBlock title="Voor klanten" sections={KLANT_SECTIONS} />
      <div className="h-px bg-border my-5" />
      <RoleBlock title="Voor barbers" sections={BARBER_SECTIONS} />
    </div>
  );
}
