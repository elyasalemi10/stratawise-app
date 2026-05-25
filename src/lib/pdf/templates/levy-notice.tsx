import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import type { LevyNoticeProps } from "../types";
import "../fonts"; // Register NunitoSans
import { BPAY_LOGO } from "../bpay-logo";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  stripe: "#f5f7fa",
  white: "#ffffff",
  destructive: "#ef4444",
};

const FONT = "NunitoSans";
const FONT_BOLD = "NunitoSans";

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

export function LevyNotice({
  managementCompany,
  oc,
  documentTitle,
  referenceNumber,
  date,
  lotOwner,
  levyPeriod,
  lineItems,
  dueDate,
  paymentInstructions,
  includeGst,
  note,
  brandColors,
}: LevyNoticeProps) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const gst = includeGst ? Math.round(subtotal * 0.1 * 100) / 100 : 0;
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
    // Centered period band , runs across the top of the page so the
    // levy's coverage window is the first thing the eye lands on.
    periodBand: {
      alignItems: "center" as const,
      marginBottom: 16,
    },
    periodBandText: {
      fontSize: 11,
      fontFamily: FONT_BOLD,
      fontWeight: 600,
      color: c.foreground,
      letterSpacing: 0.5,
    },
    // Top section
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
    levyTitle: {
      fontSize: 22,
      fontFamily: FONT_BOLD,
      fontWeight: 600,
      color: c.foreground,
      textAlign: "right" as const,
    },
    levySubtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 2,
      textAlign: "right" as const,
    },
    // Info section
    infoRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
      marginBottom: 18,
      gap: 20,
    },
    infoLeft: { flex: 1 },
    infoLine: { flexDirection: "row", marginBottom: 4 },
    infoLabel: { fontSize: 9, color: c.muted, width: 60 },
    infoValue: { fontSize: 10, fontFamily: FONT, color: c.foreground, flex: 1 },
    infoValueBold: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, flex: 1 },
    // Owner box
    ownerBox: {
      width: 200,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
      alignItems: "flex-end" as const,
      alignSelf: "flex-start" as const,
    },
    ownerName: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, marginBottom: 2, textAlign: "right" as const },
    ownerDetail: { fontSize: 10, color: c.foreground, lineHeight: 1.4, textAlign: "right" as const },
    // Note
    noteSection: { marginBottom: 14, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: c.lightBg, borderRadius: 2 },
    noteText: { fontSize: 9, color: c.foreground, lineHeight: 1.5 },
    // Table header
    tableHeader: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableHeaderCell: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 700, color: c.white },
    // Rows , description flex:3, amount flex:1.5 for more gap (#5)
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
    // Totals
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
    // Due date
    dueRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" as const, marginBottom: 14, gap: 12 },
    dueLabel: { fontSize: 15, fontFamily: FONT_BOLD, fontWeight: 700, color: brand2 },
    dueValue: { fontSize: 12, fontFamily: FONT_BOLD, fontWeight: 600, color: brand2 },
    // Tear line
    tearLine: { borderBottomWidth: 1, borderBottomColor: c.border, borderStyle: "dashed" as const, marginVertical: 14 },
    // Payment slip
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
    // Bank text
    bankRow: { flexDirection: "row", marginBottom: 5 },
    bankLabel: { fontSize: 13, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, width: 110 },
    bankValue: { fontSize: 13, color: c.foreground, flex: 1 },
    // BPAY , fixed-width logo, text wraps in its own column (#6)
    bpaySection: { marginTop: 14, flexDirection: "row", alignItems: "flex-start" as const, gap: 14 },
    bpayLogo: { width: 90, height: 36, objectFit: "contain" as const },
    bpayDetails: { flex: 1 },
    bpayRow: { flexDirection: "row", marginBottom: 3 },
    bpayLabel: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, width: 80 },
    bpayValue: { fontSize: 11, color: c.foreground, flex: 1 },
    slipRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    slipLabel: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground },
    slipValue: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, textAlign: "right" as const },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Centred period band at the very top ── */}
        <View style={s.periodBand}>
          <Text style={s.periodBandText}>
            {levyPeriod.start} , {levyPeriod.end}
          </Text>
        </View>

        {/* ── Top: Logo + Title ── */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 150 }}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : null}
          </View>
          {/* #3: customisable title, #4: maxWidth prevents overflow */}
          <View style={s.titleBlock}>
            <Text style={s.levyTitle}>{documentTitle || "Levy Notice"}</Text>
            <Text style={s.levySubtitle}>{referenceNumber}</Text>
          </View>
        </View>

        {/* ── Info row ── */}
        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issued for</Text>
              <Text style={s.infoValueBold}>{oc.name} {oc.plan_number}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Address</Text>
              <Text style={s.infoValue}>{oc.address}</Text>
            </View>
            {oc.abn ? (
              <View style={s.infoLine}>
                <Text style={s.infoLabel}>ABN</Text>
                <Text style={s.infoValue}>{oc.abn}</Text>
              </View>
            ) : null}
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issue date</Text>
              <Text style={s.infoValue}>{fmtDate(date)}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Due date</Text>
              <Text style={s.infoValueBold}>{dueDate}</Text>
            </View>
          </View>

          <View style={s.ownerBox}>
            <Text style={s.ownerName}>{lotOwner.name}</Text>
            <Text style={s.ownerDetail}>{lotOwner.address}</Text>
            <Text style={s.ownerDetail}>Lot {lotOwner.lot_number}</Text>
          </View>
        </View>

        {/* ── Custom note (#2) ── */}
        {note ? (
          <View style={s.noteSection}>
            <Text style={s.noteText}>{note}</Text>
          </View>
        ) : null}

        {/* ── Line items , #5: flex 3/1.5 for wider amount column ── */}
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

        {/* ── Totals ── */}
        <View style={s.totalsSection}>
          <View style={s.totalsBlock}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{fmt(subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GST</Text>
              <Text style={s.totalValue}>{fmt(gst)}</Text>
            </View>
            <View style={s.totalDueRow}>
              <Text style={s.totalDueLabel}>Total amount due</Text>
              <Text style={s.totalDueValue}>{fmt(subtotal + gst)}</Text>
            </View>
          </View>
        </View>

        {/* ── Due date ── */}
        <View style={s.dueRow}>
          <Text style={s.dueLabel}>Payment due</Text>
          <Text style={s.dueValue}>{dueDate}</Text>
        </View>

        {/* ── Tear line ── */}
        <View style={s.tearLine} />

        {/* ── Payment slip ── */}
        <View style={s.paymentSlip}>
          <View style={s.paymentLeft}>
            <Text style={s.paymentTitle}>Payment details</Text>

            <View style={s.bankRow}>
              <Text style={s.bankLabel}>BSB:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.bsb}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account No:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.account_number}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account name:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.account_name}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Reference:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.reference}</Text>
            </View>

            {/* #1: BPAY at bottom-left, #6: fixed logo width, text wraps independently */}
            {paymentInstructions.bpay ? (
              <View style={s.bpaySection}>
                <Image src={BPAY_LOGO} style={s.bpayLogo} />
                <View style={s.bpayDetails}>
                  <View style={s.bpayRow}>
                    <Text style={s.bpayLabel}>Biller code:</Text>
                    <Text style={s.bpayValue}>{paymentInstructions.bpay.biller_code}</Text>
                  </View>
                  <View style={[s.bpayRow, { marginBottom: 0 }]}>
                    <Text style={s.bpayLabel}>Reference:</Text>
                    <Text style={s.bpayValue}>{paymentInstructions.bpay.reference}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          <View style={s.paymentRight}>
            <Text style={[s.ownerDetail, { fontFamily: FONT_BOLD, fontWeight: 600, textAlign: "left" as const }]}>
              {managementCompany.name}
            </Text>
            <Text style={[s.ownerDetail, { marginTop: 3, textAlign: "left" as const }]}>Lot {lotOwner.lot_number}</Text>
            <Text style={[s.ownerDetail, { textAlign: "left" as const }]}>{oc.address}</Text>

            <View style={{ marginTop: 8, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 }}>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Total payable:</Text>
                <Text style={s.slipValue}>{fmt(subtotal + gst)}</Text>
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
