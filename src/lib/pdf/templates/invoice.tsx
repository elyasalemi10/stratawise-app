import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import "../fonts";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  stripe: "#f5f7fa",
  white: "#ffffff",
};

const FONT = "NunitoSans";
const FONT_BOLD = "NunitoSans";

export interface InvoiceLineItem {
  description: string;
  amount: number;
}

export interface InvoiceIssuer {
  name: string;
  legal_name?: string | null;
  abn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface InvoiceRecipient {
  name: string;
  address?: string | null;
}

export interface InvoicePaymentInstructions {
  bsb: string;
  account_number: string;
  account_name: string;
  reference: string;
}

export interface InvoiceProps {
  issuer: InvoiceIssuer;
  recipient: InvoiceRecipient;
  documentTitle: string;
  referenceNumber: string;
  issueDate: Date;
  dueDate: string;
  lineItems: InvoiceLineItem[];
  includeGst?: boolean;
  note?: string;
  paymentInstructions: InvoicePaymentInstructions;
  brandColors?: { primary: string; secondary: string };
}

function fmt(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function Invoice({
  issuer,
  recipient,
  documentTitle,
  referenceNumber,
  issueDate,
  dueDate,
  lineItems,
  includeGst,
  note,
  paymentInstructions,
  brandColors,
}: InvoiceProps) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gst = includeGst ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
  const total = subtotal + gst;
  const brand1 = brandColors?.primary ?? "#2b7fff";
  const brand2 = brandColors?.secondary ?? "#00bd7d";

  const s = StyleSheet.create({
    page: {
      fontFamily: FONT,
      fontSize: 10,
      color: c.foreground,
      paddingTop: 28,
      paddingBottom: 20,
      paddingHorizontal: 24,
    },
    refBand: {
      alignItems: "center" as const,
      marginBottom: 16,
    },
    refBandText: {
      fontSize: 11,
      fontFamily: FONT_BOLD,
      fontWeight: 600,
      color: c.foreground,
      letterSpacing: 0.5,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 18,
    },
    logo: {
      maxHeight: 60,
      maxWidth: 150,
      objectFit: "contain" as const,
    },
    titleBlock: {
      alignItems: "flex-end" as const,
      maxWidth: 280,
    },
    title: {
      fontSize: 22,
      fontFamily: FONT_BOLD,
      fontWeight: 600,
      color: c.foreground,
      textAlign: "right" as const,
    },
    subtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 2,
      textAlign: "right" as const,
    },
    infoRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
      marginBottom: 18,
      gap: 20,
    },
    infoLeft: { flex: 1 },
    sectionHeading: {
      fontSize: 8,
      fontFamily: FONT_BOLD,
      fontWeight: 700,
      color: c.muted,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    recipientName: {
      fontSize: 13,
      fontFamily: FONT_BOLD,
      fontWeight: 700,
      color: c.foreground,
      marginBottom: 4,
    },
    recipientLine: {
      fontSize: 10,
      color: c.foreground,
      lineHeight: 1.4,
    },
    metaRow: { flexDirection: "row", marginTop: 4 },
    metaLabel: { fontSize: 9, color: c.muted, width: 70 },
    metaValue: { fontSize: 10, fontFamily: FONT, color: c.foreground, flex: 1 },
    metaValueBold: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, flex: 1 },
    fromBox: {
      width: 220,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
      alignSelf: "flex-start" as const,
    },
    fromHeading: {
      fontSize: 8,
      fontFamily: FONT_BOLD,
      fontWeight: 700,
      color: c.muted,
      textTransform: "uppercase" as const,
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    fromName: {
      fontSize: 11,
      fontFamily: FONT_BOLD,
      fontWeight: 700,
      color: c.foreground,
      marginBottom: 2,
    },
    fromLegal: {
      fontSize: 9,
      color: c.muted,
      marginBottom: 4,
    },
    fromLine: {
      fontSize: 9.5,
      color: c.foreground,
      lineHeight: 1.4,
    },
    noteSection: { marginBottom: 14, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: c.lightBg, borderRadius: 2 },
    noteText: { fontSize: 9, color: c.foreground, lineHeight: 1.5 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableHeaderCell: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 700, color: c.white },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
      backgroundColor: c.stripe,
    },
    tableCell: { fontSize: 10, color: c.foreground },
    tableCellRight: { fontSize: 10, color: c.foreground, textAlign: "right" as const },
    totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 14, marginTop: 6 },
    totalsBlock: { width: 240 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 6 },
    totalLabel: { fontSize: 10, color: c.muted },
    totalValue: { fontSize: 10, color: c.foreground, textAlign: "right" as const },
    totalDueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderTopWidth: 1.5,
      borderTopColor: c.foreground,
      marginTop: 2,
    },
    totalDueLabel: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 700, color: c.foreground },
    totalDueValue: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 700, color: c.foreground, textAlign: "right" as const },
    dueRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" as const, marginBottom: 14, gap: 12 },
    dueLabel: { fontSize: 15, fontFamily: FONT_BOLD, fontWeight: 700, color: brand2 },
    dueValue: { fontSize: 12, fontFamily: FONT_BOLD, fontWeight: 600, color: brand2 },
    tearLine: { borderBottomWidth: 1, borderBottomColor: c.border, borderStyle: "dashed" as const, marginVertical: 14 },
    paymentSlip: { flexDirection: "row", gap: 20, alignItems: "flex-start" as const },
    paymentLeft: { flex: 1 },
    paymentRight: {
      width: 210,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
      alignSelf: "flex-start" as const,
    },
    paymentTitle: { fontSize: 14, fontFamily: FONT_BOLD, fontWeight: 700, color: c.foreground, marginBottom: 10 },
    bankRow: { flexDirection: "row", marginBottom: 5 },
    bankLabel: { fontSize: 13, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, width: 110 },
    bankValue: { fontSize: 13, color: c.foreground, flex: 1 },
    slipRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    slipLabel: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground },
    slipValue: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, textAlign: "right" as const },
    slipLineLabel: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.muted, marginTop: 6 },
    slipLineValue: { fontSize: 10, color: c.foreground, marginTop: 1 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Reference at the very top, centred */}
        <View style={s.refBand}>
          <Text style={s.refBandText}>{referenceNumber}</Text>
        </View>

        {/* Logo + Title */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 150 }}>
            {issuer.logo_url ? <Image src={issuer.logo_url} style={s.logo} /> : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>{documentTitle}</Text>
            <Text style={s.subtitle}>{referenceNumber}</Text>
          </View>
        </View>

        {/* Issued to (left) + Issuer block (right) */}
        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <Text style={s.sectionHeading}>Issued to</Text>
            <Text style={s.recipientName}>{recipient.name}</Text>
            {recipient.address ? (
              <Text style={s.recipientLine}>{recipient.address}</Text>
            ) : null}

            <View style={[s.metaRow, { marginTop: 14 }]}>
              <Text style={s.metaLabel}>Issue date</Text>
              <Text style={s.metaValue}>{fmtDate(issueDate)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Due date</Text>
              <Text style={s.metaValueBold}>{dueDate}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Reference</Text>
              <Text style={s.metaValueBold}>{referenceNumber}</Text>
            </View>
          </View>

          <View style={s.fromBox}>
            <Text style={s.fromHeading}>From</Text>
            <Text style={s.fromName}>{issuer.name}</Text>
            {issuer.legal_name && issuer.legal_name !== issuer.name ? (
              <Text style={s.fromLegal}>{issuer.legal_name}</Text>
            ) : null}
            {issuer.abn ? (
              <Text style={s.fromLine}>ABN: {issuer.abn}</Text>
            ) : null}
            {issuer.address ? (
              <Text style={s.fromLine}>{issuer.address}</Text>
            ) : null}
            {issuer.phone ? (
              <Text style={s.fromLine}>{issuer.phone}</Text>
            ) : null}
            {issuer.email ? (
              <Text style={s.fromLine}>{issuer.email}</Text>
            ) : null}
          </View>
        </View>

        {note ? (
          <View style={s.noteSection}>
            <Text style={s.noteText}>{note}</Text>
          </View>
        ) : null}

        {/* Line items */}
        <View style={{ marginBottom: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { flex: 3 }]}>Description</Text>
            <Text style={[s.tableHeaderCell, { flex: 1.5, textAlign: "right" as const }]}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRowStriped : s.tableRow}>
              <Text style={[s.tableCell, { flex: 3 }]}>{item.description}</Text>
              <Text style={[s.tableCellRight, { flex: 1.5 }]}>{fmt(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={s.totalsSection}>
          <View style={s.totalsBlock}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{fmt(subtotal)}</Text>
            </View>
            {includeGst ? (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>GST (10%)</Text>
                <Text style={s.totalValue}>{fmt(gst)}</Text>
              </View>
            ) : null}
            <View style={s.totalDueRow}>
              <Text style={s.totalDueLabel}>Total amount due</Text>
              <Text style={s.totalDueValue}>{fmt(total)}</Text>
            </View>
          </View>
        </View>

        <View style={s.dueRow}>
          <Text style={s.dueLabel}>Payment due</Text>
          <Text style={s.dueValue}>{dueDate}</Text>
        </View>

        <View style={s.tearLine} />

        {/* Payment slip */}
        <View style={s.paymentSlip}>
          <View style={s.paymentLeft}>
            <Text style={s.paymentTitle}>Payment details</Text>

            <View style={s.bankRow}>
              <Text style={s.bankLabel}>BSB:</Text>
              <Text style={s.bankValue}>{paymentInstructions.bsb}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account No:</Text>
              <Text style={s.bankValue}>{paymentInstructions.account_number}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account name:</Text>
              <Text style={s.bankValue}>{paymentInstructions.account_name}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Reference:</Text>
              <Text style={s.bankValue}>{paymentInstructions.reference}</Text>
            </View>
          </View>

          <View style={s.paymentRight}>
            <Text style={[s.fromName, { fontSize: 10 }]}>{recipient.name}</Text>
            <Text style={s.slipLineLabel}>Reference</Text>
            <Text style={s.slipLineValue}>{paymentInstructions.reference}</Text>

            <View style={{ marginTop: 8, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 }}>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Total payable:</Text>
                <Text style={s.slipValue}>{fmt(total)}</Text>
              </View>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Due date:</Text>
                <Text style={s.slipValue}>{dueDate}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
