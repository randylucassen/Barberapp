import type { Metadata } from "next";
import Link from "next/link";

// Handelsnaam "Groomy" ligt nog niet definitief vast (zie PROJECT.md,
// "Openstaande acties voor jou") — bij een naamswijziging moet die overal
// hieronder ook aangepast worden, niet alleen in layout.tsx/metadata.

export const metadata: Metadata = {
  title: "Privacyverklaring — Groomy",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[17px] font-semibold mt-8 mb-2">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-[22px] text-text-secondary mt-2">{children}</p>;
}

export default function PrivacybeleidPage() {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/" className="text-[13px] text-text-accent">← Groomy</Link>
        <h1 className="text-[26px] font-bold tracking-[-0.01em] mt-4">Privacyverklaring</h1>
        <p className="text-[13px] text-text-tertiary mt-1">Laatst bijgewerkt: 18 augustus 2026</p>

        <H2>1. Wie zijn wij</H2>
        <P>
          Groomy is een dienst van Barbershop Noviomagus (eenmanszaak), Plein
          1944-17, 6511 JC Nijmegen, KvK-nummer 83716580. Wij zijn de
          verwerkingsverantwoordelijke voor de persoonsgegevens die via de
          Groomy-app en -website worden verwerkt. Vragen over privacy? Mail
          naar{" "}
          <a href="mailto:barbershopnoviomagus@gmail.com" className="text-text-accent">
            barbershopnoviomagus@gmail.com
          </a>
          .
        </P>

        <H2>2. Welke gegevens verzamelen we, en waarom</H2>
        <P>
          <strong>Naam, e-mail, telefoonnummer, rol (klant/barber)</strong> —
          om een account aan te maken, in te loggen en contact mogelijk te
          maken rond een boeking. Grondslag: uitvoering van de overeenkomst.
        </P>
        <P>
          <strong>Adres van de afspraak</strong> — zodat de barber weet waar
          hij naartoe moet. Grondslag: uitvoering van de overeenkomst.
        </P>
        <P>
          <strong>Live locatie van de barber tijdens een actieve rit</strong>{" "}
          — om de klant te laten zien waar de barber is en wanneer die
          aankomt. Alleen actief zolang een boeking onderweg is, niet apart
          bewaard na afloop. Grondslag: uitvoering van de overeenkomst.
        </P>
        <P>
          <strong>Betaalgegevens</strong> — verwerkt door Stripe voor de
          afhandeling van betalingen. Wij zien of bewaren zelf geen
          kaartgegevens.
        </P>
        <P>
          <strong>Legitimatiebewijs, verzekeringsbewijs, diploma</strong>{" "}
          (alleen barbers) — voor verificatie voordat een barber diensten
          mag aanbieden. Grondslag: gerechtvaardigd belang (veiligheid en
          kwaliteit van het platform).
        </P>
        <P>
          <strong>Reviews en beoordelingen</strong> — om andere gebruikers te
          helpen een keuze te maken.
        </P>
        <P>
          <strong>Push-token / e-mailadres voor meldingen</strong> — om je op
          de hoogte te houden van je boeking.
        </P>
        <P>
          <strong>Technische gegevens</strong> (IP-adres, foutmeldingen) — om
          de app stabiel en veilig te houden. Grondslag: gerechtvaardigd
          belang.
        </P>
        <P>
          We verzamelen nooit meer gegevens dan nodig voor deze doelen en
          gebruiken je gegevens niet voor advertentiedoeleinden.
        </P>

        <H2>3. Met wie delen we gegevens</H2>
        <P>
          Om Groomy te laten werken, delen we gegevens met een beperkt aantal
          zorgvuldig gekozen verwerkers: <strong>Supabase</strong> (database
          en inlogsysteem), <strong>Stripe</strong> (betalingen en
          uitbetalingen aan barbers), <strong>Resend</strong> (transactionele
          e-mail), <strong>Mapbox</strong> (kaarten en locatie),{" "}
          <strong>Vercel</strong> (hosting) en <strong>Sentry</strong>{" "}
          (foutmonitoring). Met deze partijen zijn (of worden)
          verwerkersovereenkomsten afgesloten. We verkopen jouw gegevens
          nooit aan derden.
        </P>
        <P>
          Barbers en klanten zien van elkaar alleen de gegevens die nodig
          zijn om een boeking uit te voeren (naam, telefoonnummer, adres van
          de afspraak) — nooit elkaars volledige profiel.
        </P>

        <H2>4. Bewaartermijnen</H2>
        <P>
          Accountgegevens bewaren we zolang je een account hebt, plus een
          redelijke termijn daarna voor administratieve en fiscale
          verplichtingen (wettelijk minimaal 7 jaar voor factuurgegevens).
          Live locatiegegevens worden niet apart bewaard na een rit.
          Verificatiedocumenten van barbers bewaren we zolang het
          barber-account actief is.
        </P>

        <H2>5. Jouw rechten</H2>
        <P>
          Je hebt recht op inzage, correctie, verwijdering, beperking van de
          verwerking, bezwaar en gegevensoverdraagbaarheid. Neem hiervoor
          contact op via{" "}
          <a href="mailto:barbershopnoviomagus@gmail.com" className="text-text-accent">
            barbershopnoviomagus@gmail.com
          </a>
          . Je hebt ook het recht een klacht in te dienen bij de Autoriteit
          Persoonsgegevens.
        </P>

        <H2>6. Beveiliging</H2>
        <P>
          We nemen passende technische en organisatorische maatregelen om je
          gegevens te beschermen, waaronder toegangsbeperking per
          gebruikersrol op databaseniveau en versleutelde verbindingen.
        </P>

        <H2>7. Cookies</H2>
        <P>
          Groomy gebruikt alleen functionele cookies die nodig zijn om je
          ingelogd te houden. Geen tracking- of advertentiecookies.
        </P>

        <H2>8. Wijzigingen</H2>
        <P>
          We kunnen deze privacyverklaring aanpassen. Bij belangrijke
          wijzigingen laten we dit weten via de app.
        </P>
      </div>
    </div>
  );
}
