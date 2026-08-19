import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { toCsv } from "@/lib/csv";
import { euro, splitBtwInclusive } from "@/lib/pricing";
import { renderInvoicePdfBuffer } from "@/lib/invoice-pdf";
import { getInvoicesForPeriod, type AdminRevenueReportRow, type AdminCostReportRow } from "@/lib/supabase/queries";
import type { WalletLedgerEntryType } from "@/lib/types";

const ESCROW_LABEL: Record<string, string> = {
  held: "Vastgehouden",
  releasing: "Wordt vrijgegeven",
  released: "Vrijgegeven",
  paid: "Uitbetaald",
  refunded: "Terugbetaald",
};

export const COST_ENTRY_LABEL: Record<WalletLedgerEntryType, string> = {
  topup: "Wallet-opwaardering",
  topup_bonus: "Stortingsbonus",
  loyalty_redemption: "Loyaliteitspunten-inwisseling",
  referral_bonus_referrer: "Referral-bonus (verwijzer)",
  referral_bonus_referee: "Referral-bonus (nieuwe gebruiker)",
};

export function buildOmzetCsv(rows: AdminRevenueReportRow[]): string {
  const header = [
    "Datum",
    "Dienst",
    "Barber",
    "Klant betaalde (EUR)",
    "Barber-uitkering (EUR)",
    "Klant-servicekosten excl. btw (EUR)",
    "Btw klant-servicekosten (EUR)",
    "Klant-servicekosten incl. btw (EUR)",
    "Omzet (EUR)",
    "Status",
  ];
  const dataRows = rows.map((r) => [
    new Date(r.createdAt).toLocaleDateString("nl-NL"),
    r.serviceName,
    r.barberName,
    euro(r.amountCents),
    euro(r.barberPayoutCents),
    euro(r.customerFeeExclBtwCents),
    euro(r.customerBtwCents),
    euro(r.customerFeeInclBtwCents),
    euro(r.revenueCents),
    ESCROW_LABEL[r.escrowState] ?? r.escrowState,
  ]);
  const totalRevenue = rows.reduce((sum, r) => sum + r.revenueCents, 0);
  // Bewust éénmaal gesplitst op het totaal i.p.v. de per-rij-afgeronde
  // excl./btw-kolommen opgeteld — zelfde methode als de barber-facturen
  // (0038: eerst sommeren, dan één keer 21% terugrekenen), anders wijkt
  // dit totaal een paar cent af door dubbele afronding terwijl het
  // conceptueel hetzelfde bedrag is als de barber-kant.
  const totalCustomerFeeInclBtw = rows.reduce((sum, r) => sum + r.customerFeeInclBtwCents, 0);
  const { exclBtwCents: totalCustomerFeeExclBtw, btwCents: totalCustomerBtw } = splitBtwInclusive(totalCustomerFeeInclBtw);
  dataRows.push([
    "Totaal",
    "",
    "",
    "",
    "",
    euro(totalCustomerFeeExclBtw),
    euro(totalCustomerBtw),
    euro(totalCustomerFeeInclBtw),
    euro(totalRevenue),
    "",
  ]);
  return toCsv(header, dataRows);
}

export function buildKostenCsv(rows: AdminCostReportRow[]): string {
  const header = ["Datum", "Gebruiker", "Type", "Bedrag (EUR)"];
  const dataRows = rows.map((r) => [
    new Date(r.createdAt).toLocaleDateString("nl-NL"),
    r.userName,
    COST_ENTRY_LABEL[r.entryType] ?? r.entryType,
    euro(r.amountCents),
  ]);
  const total = rows.reduce((sum, r) => sum + r.amountCents, 0);
  dataRows.push(["Totaal", "", "", euro(total)]);
  return toCsv(header, dataRows);
}

export interface SamenvattingInput {
  from: string;
  to: string;
  revenueRows: AdminRevenueReportRow[];
  costRows: AdminCostReportRow[];
  invoiceCount: number;
  invoiceBtwCents: number;
}

// Bewust "bruto resultaat", nooit "netto" — externe kosten (Stripe-fees,
// hosting, abonnementen) staan nergens in de database en ontbreken dus
// hier; een "netto"-label zou een vals compleet beeld geven. Zie de
// toelichting op het Administratief-scherm zelf.
//
// De omzet bestaat uit twee btw-plichtige bemiddelingsdiensten (21%,
// algemeen tarief — geen vrijstelling van toepassing, bevestigd via
// belastingdienst.nl): de servicekosten aan de klant (B2C, geen
// factuurplicht, btw verschuldigd bij ontvangst van de betaling) en de
// servicekosten aan de barber (B2B, wél factuurplicht — al gedekt door
// barber_invoices/0038). Beide worden hier bewust apart gehouden i.p.v.
// samengevoegd tot één btw-totaal, want ze hebben een andere
// juridische grondslag/periode-scope (klant-kant: alle boekingen in de
// gekozen periode; barber-kant: de daadwerkelijk in die periode
// gegenereerde facturen).
// Gedeeld door buildSamenvattingCsv en de JSON-voorvertoning in de
// samenvatting-route, zodat de berekening zelf maar op één plek staat.
export function buildSamenvattingRows(input: SamenvattingInput): string[][] {
  const grossRevenueCents = input.revenueRows.reduce((sum, r) => sum + r.revenueCents, 0);
  const totalCostsCents = input.costRows.reduce((sum, r) => sum + r.amountCents, 0);
  const grossResultCents = grossRevenueCents - totalCostsCents;

  // Zelfde éénmaal-op-het-totaal-splitsen als in buildOmzetCsv — zie de
  // toelichting daar.
  const customerFeeInclBtwCents = input.revenueRows.reduce((sum, r) => sum + r.customerFeeInclBtwCents, 0);
  const { exclBtwCents: customerFeeExclBtwCents, btwCents: customerBtwCents } = splitBtwInclusive(customerFeeInclBtwCents);
  const totalBtwCents = customerBtwCents + input.invoiceBtwCents;

  return [
    ["Periode", `${input.from} t/m ${input.to}`],
    ["Aantal boekingen", String(input.revenueRows.length)],
    ["Bruto omzet (EUR)", euro(grossRevenueCents)],
    ["Totale kosten (EUR)", euro(totalCostsCents)],
    ["Bruto resultaat (EUR)", euro(grossResultCents)],
    ["Klant-servicekosten excl. btw (EUR)", euro(customerFeeExclBtwCents)],
    ["Btw op klant-servicekosten (EUR)", euro(customerBtwCents)],
    ["Aantal facturen aan barbers", String(input.invoiceCount)],
    ["Btw op barberfacturen (EUR)", euro(input.invoiceBtwCents)],
    ["Totaal verschuldigde btw (EUR)", euro(totalBtwCents)],
  ];
}

export function buildSamenvattingCsv(input: SamenvattingInput): string {
  return toCsv(["Kengetal", "Waarde"], buildSamenvattingRows(input));
}

function invoiceFilename(periodEnd: string, invoiceNumber: number): string {
  const year = new Date(periodEnd).getFullYear();
  return `factuur-INV-${year}-${String(invoiceNumber).padStart(4, "0")}.pdf`;
}

// Gedeeld door de facturen-ZIP en de alles-ZIP — haalt alle facturen op
// waarvan period_start binnen [from, toExclusive) valt en rendert ze
// allemaal naar PDF, met dezelfde renderInvoicePdfBuffer() als de
// individuele download in /api/barber/invoices/[id]/pdf.
export async function buildInvoicePdfEntries(
  service: SupabaseClient,
  from: string,
  toExclusive: string
): Promise<Array<{ filename: string; buffer: Buffer }>> {
  const invoices = await getInvoicesForPeriod(service, from, toExclusive);
  return Promise.all(
    invoices.map(async (inv) => {
      const buffer = await renderInvoicePdfBuffer(
        {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          barberId: inv.barberId,
          periodStart: inv.periodStart,
          periodEnd: inv.periodEnd,
          feeExclBtwCents: inv.feeExclBtwCents,
          btwCents: inv.btwCents,
          feeInclBtwCents: inv.feeInclBtwCents,
          lineItems: inv.lineItems,
          createdAt: inv.createdAt,
        },
        { name: inv.barberName, address: inv.barberAddress, city: inv.barberCity, kvkNumber: inv.barberKvkNumber }
      );
      return { filename: invoiceFilename(inv.periodEnd, inv.invoiceNumber), buffer };
    })
  );
}

export async function zipToBuffer(entries: Array<{ filename: string; buffer: Buffer }>): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.filename, entry.buffer);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
