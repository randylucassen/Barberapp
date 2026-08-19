import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { COMPANY_INFO } from "@/lib/company-info";
import { euro } from "@/lib/pricing";
import type { BarberInvoice } from "@/lib/types";

// Losstaand van de e-mail-/appstijl (die leunt op Tailwind/CSS) — React-
// PDF heeft zijn eigen, beperktere StyleSheet-API, dus hier bewust een
// eigen kleine kleuren/spacing-set die overeenkomt met tailwind.config.ts
// i.p.v. die config zelf te kunnen hergebruiken.
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#111111", fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  brand: { fontSize: 20, fontWeight: 700, color: "#0EA5A4" },
  title: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  metaBlock: { width: "48%" },
  label: { fontSize: 8, color: "#6B7280", marginBottom: 2, textTransform: "uppercase" },
  value: { fontSize: 10, marginBottom: 8, lineHeight: 1.4 },
  table: { marginTop: 8 },
  tableHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111111",
    paddingBottom: 4,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 4,
  },
  colDate: { width: "20%" },
  colService: { width: "50%" },
  colAmount: { width: "30%", textAlign: "right" },
  tableHeaderText: { fontSize: 8, color: "#6B7280", textTransform: "uppercase" },
  totalsBlock: { marginTop: 16, alignSelf: "flex-end", width: "45%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#111111",
    fontWeight: 700,
  },
  note: { marginTop: 24, fontSize: 9, color: "#374151", lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9CA3AF",
    textAlign: "center",
    borderTopWidth: 0.5,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
});

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function invoiceNumberLabel(invoice: BarberInvoice): string {
  const year = new Date(invoice.periodEnd).getFullYear();
  return `INV-${year}-${String(invoice.invoiceNumber).padStart(4, "0")}`;
}

interface InvoiceBarberInfo {
  name: string;
  address: string | null;
  city: string | null;
  kvkNumber: string | null;
}

function InvoiceDocument({ invoice, barber }: { invoice: BarberInvoice; barber: InvoiceBarberInfo }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>{COMPANY_INFO.name}</Text>
          <View>
            <Text style={styles.title}>FACTUUR</Text>
            <Text style={{ fontSize: 9, textAlign: "right", marginTop: 4, color: "#6B7280" }}>
              {invoiceNumberLabel(invoice)}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Van</Text>
            <Text style={styles.value}>
              {COMPANY_INFO.legalName} ({COMPANY_INFO.legalForm}){"\n"}
              {COMPANY_INFO.address}{"\n"}
              {COMPANY_INFO.postalCode} {COMPANY_INFO.city}{"\n"}
              KvK {COMPANY_INFO.kvkNumber}{"\n"}
              Btw-nummer: {COMPANY_INFO.btwNumber}
            </Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Aan</Text>
            <Text style={styles.value}>
              {barber.name}
              {"\n"}
              {barber.address ?? "—"}
              {"\n"}
              {barber.city ?? ""}
              {"\n"}
              {barber.kvkNumber ? `KvK ${barber.kvkNumber}` : ""}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Factuurdatum</Text>
            <Text style={styles.value}>{formatDate(invoice.createdAt)}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.label}>Periode</Text>
            <Text style={styles.value}>
              {formatDate(invoice.periodStart)} — {formatDate(invoice.periodEnd)}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colDate, styles.tableHeaderText]}>Datum</Text>
            <Text style={[styles.colService, styles.tableHeaderText]}>Dienst</Text>
            <Text style={[styles.colAmount, styles.tableHeaderText]}>Servicekosten (incl. btw)</Text>
          </View>
          {invoice.lineItems.map((line) => (
            <View key={line.bookingId} style={styles.tableRow}>
              <Text style={styles.colDate}>{formatDate(line.date)}</Text>
              <Text style={styles.colService}>{line.serviceName}</Text>
              <Text style={styles.colAmount}>€ {euro(line.feeInclBtwCents)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotaal excl. btw</Text>
            <Text>€ {euro(invoice.feeExclBtwCents)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>21% btw</Text>
            <Text>€ {euro(invoice.btwCents)}</Text>
          </View>
          <View style={styles.totalsRowFinal}>
            <Text>Totaal incl. btw</Text>
            <Text>€ {euro(invoice.feeInclBtwCents)}</Text>
          </View>
        </View>

        <Text style={styles.note}>
          Dit bedrag is al verrekend met je uitbetalingen over deze periode — je hoeft dit niet apart te
          betalen of over te maken.
        </Text>

        <Text style={styles.footer}>
          {COMPANY_INFO.legalName} · {COMPANY_INFO.address}, {COMPANY_INFO.postalCode} {COMPANY_INFO.city} ·
          KvK {COMPANY_INFO.kvkNumber} · {COMPANY_INFO.email}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdfBuffer(invoice: BarberInvoice, barber: InvoiceBarberInfo): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument invoice={invoice} barber={barber} />);
}
