import { AdminShell } from "@/components/admin/AdminShell";
import { AdministratiefPanel } from "@/components/admin/AdministratiefPanel";

export default function AdminAdministratiefPage() {
  return (
    <AdminShell>
      <div className="text-[24px] font-bold tracking-[-0.02em] mb-1">Administratief</div>
      <div className="text-[14px] text-text-secondary mb-4 max-w-2xl">
        Downloads voor de boekhouder, per periode. Omzet en de facturen aan barbers komen rechtstreeks uit de
        boekingen; kosten bevat alleen wat het platform zelf weggeeft (wallet- en referral-bonussen). Externe
        kosten zoals Stripe-transactiekosten, hosting en abonnementen staan nergens in de database — daarom is
        &ldquo;samenvatting&rdquo; bewust een <strong>bruto</strong>resultaat, geen netto-resultaat. De omzet bestaat
        uit twee btw-plichtige servicekosten-stromen (21%) die bewust apart gehouden worden: de klant-servicekosten
        (geen factuurplicht, wel gewoon btw verschuldigd) en de barber-servicekosten (wél factuurplicht, gedekt door
        de facturen hierboven) — beide zijn los terug te vinden in het omzet-overzicht en de samenvatting.
      </div>
      <AdministratiefPanel />
    </AdminShell>
  );
}
