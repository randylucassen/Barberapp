import type { Metadata } from "next";
import Link from "next/link";

// Handelsnaam "Groomy" ligt nog niet definitief vast (zie PROJECT.md,
// "Openstaande acties voor jou") — bij een naamswijziging moet die overal
// hieronder ook aangepast worden, niet alleen in layout.tsx/metadata.

export const metadata: Metadata = {
  title: "Algemene voorwaarden — Groomy",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-semibold mt-8 mb-2">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[22px] text-text-secondary mt-2">{children}</p>;
}

export default function VoorwaardenPage() {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-[13px] text-text-accent">← Groomy</Link>
        <h1 className="text-[26px] font-bold tracking-[-0.01em] mt-4">Algemene voorwaarden</h1>
        <p className="text-[13px] text-text-tertiary mt-1">Laatst bijgewerkt: 18 augustus 2026</p>

        <H2>1. Wie we zijn</H2>
        <P>
          Groomy is een platform van Barbershop Noviomagus (eenmanszaak, KvK
          83716580), Plein 1944-17, 6511 JC Nijmegen, dat klanten en
          zelfstandige barbers met elkaar in contact brengt voor knipbeurten
          aan huis of op locatie.
        </P>

        <H2>2. Wat Groomy wel en niet is</H2>
        <P>
          Groomy is een bemiddelingsplatform. Barbers die via Groomy diensten
          aanbieden zijn zelfstandig ondernemer en niet in dienst van
          Barbershop Noviomagus. De overeenkomst voor de daadwerkelijke
          dienst (de knipbeurt) komt tot stand tussen jou als klant en de
          barber. Groomy faciliteert het vinden van een barber, het
          inplannen van de afspraak en de betaling.
        </P>

        <H2>3. Account</H2>
        <P>
          Je moet minimaal 18 jaar zijn om een account aan te maken. Je bent
          zelf verantwoordelijk voor de juistheid van de gegevens die je
          invult en voor de vertrouwelijkheid van je inloggegevens.
        </P>

        <H2>4. Een afspraak boeken en betalen</H2>
        <P>
          Bij het boeken van een afspraak zie je vooraf de prijs. Het bedrag
          wordt bij bevestiging in escrow vastgehouden en pas na afronding
          van de afspraak (of na het verstrijken van de daarvoor geldende
          termijn) vrijgegeven aan de barber, onder inhouding van
          servicekosten.
        </P>

        <H2>5. Annuleren</H2>
        <P>
          Annuleren kan gratis zolang de barber nog niet onderweg is (of, bij
          een vooraf ingeplande afspraak, tot 1 uur van tevoren). Annuleer je
          daarna alsnog, dan wordt 50% van het dienstbedrag ingehouden als
          compensatie voor de barber; de servicekosten blijven in alle
          gevallen verschuldigd. Annuleert de barber zelf, dan krijg je altijd
          het volledige bedrag terug. Verschijnt een barber niet op een
          ingeplande afspraak, dan krijg je automatisch het volledige bedrag
          terug. Terugbetalingen gaan altijd terug naar de oorspronkelijke
          betaalmethode, doorlooptijd doorgaans 5–10 werkdagen.
        </P>

        <H2>6. Verantwoordelijkheid van de barber</H2>
        <P>
          De barber is zelf verantwoordelijk voor de kwaliteit van de
          dienstverlening, voor een eigen (beroeps)aansprakelijkheids-
          verzekering, en voor het naleven van hygiëne- en
          veiligheidsnormen.
        </P>
        <P>
          Bevestigt een barber bij een vooraf ingeplande afspraak niet
          binnen 60 minuten na de afgesproken tijd dat hij onderweg is, dan
          vervalt de afspraak automatisch en krijgt de klant het volledige
          bedrag terug. De barber ontvangt hierbij een waarschuwing; bij een
          tweede waarschuwing wordt het barber-account automatisch
          geschorst.
        </P>

        <H2>7. Aansprakelijkheid van Groomy</H2>
        <P>
          Groomy is niet aansprakelijk voor de kwaliteit van de door de
          barber geleverde dienst — daarvoor is de barber zelf
          verantwoordelijk. Groomy is wel verantwoordelijk voor de correcte
          werking van het platform en de betaalverwerking. Bij een geschil
          kun je dit via de app melden; Groomy bemiddelt en kan in gepaste
          gevallen (bijvoorbeeld een niet-uitgevoerde dienst) een
          terugbetaling doen.
        </P>

        <H2>8. Tegoed, loyaliteitspunten en kortingscodes</H2>
        <P>
          Wallet-tegoed en loyaliteitspunten zijn niet inwisselbaar voor
          contant geld en uitsluitend te gebruiken binnen Groomy.
          Kortingscodes zijn eenmalig per gebruiker te gebruiken tenzij
          anders vermeld.
        </P>

        <H2>9. Klachten</H2>
        <P>
          Klachten over een afspraak kun je binnen 24 uur na afloop melden
          via de app, of via{" "}
          <a href="mailto:barbershopnoviomagus@gmail.com" className="text-text-accent">
            barbershopnoviomagus@gmail.com
          </a>
          . We streven ernaar binnen 5 werkdagen te reageren.
        </P>

        <H2>10. Wijzigingen</H2>
        <P>
          We kunnen deze voorwaarden aanpassen; bij belangrijke wijzigingen
          informeren we je via de app.
        </P>

        <H2>11. Toepasselijk recht</H2>
        <P>
          Op deze voorwaarden is Nederlands recht van toepassing. Geschillen
          worden voorgelegd aan de bevoegde rechter in het arrondissement
          Gelderland.
        </P>
      </div>
    </div>
  );
}
