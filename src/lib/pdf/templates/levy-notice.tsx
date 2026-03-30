import React from "react";
import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import type { LevyNoticeProps } from "../types";
import "../fonts"; // Register NunitoSans

const BPAY_LOGO = "data:image/png;base64,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";

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
  subdivision,
  referenceNumber,
  date,
  lotOwner,
  levyPeriod,
  lineItems,
  totalDue,
  dueDate,
  paymentInstructions,
  outstandingBalances,
  brandColors,
}: LevyNoticeProps) {
  const hasOutstanding = outstandingBalances && outstandingBalances.length > 0;
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
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
    ownerBox: {
      flex: 1,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
    },
    ownerName: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, marginBottom: 2 },
    ownerDetail: { fontSize: 10, color: c.foreground, lineHeight: 1.4 },
    // Table
    tableHeader: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 6,
      paddingHorizontal: 8,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableHeaderCell: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.white },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 7,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
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
    dueLabel: { fontSize: 12, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground },
    dueValue: { fontSize: 14, fontFamily: FONT_BOLD, fontWeight: 700, color: brand2 },
    // Tear line
    tearLine: { borderBottomWidth: 1, borderBottomColor: c.border, borderStyle: "dashed" as const, marginVertical: 14 },
    // Payment slip
    paymentSlip: { flexDirection: "row", gap: 20 },
    paymentLeft: { flex: 1 },
    paymentRight: {
      width: 210,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
    },
    paymentTitle: { fontSize: 12, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, marginBottom: 8 },
    bankRow: { flexDirection: "row", marginBottom: 4 },
    bankLabel: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, width: 90 },
    bankValue: { fontSize: 10, color: c.foreground },
    bpayLogo: { width: 56, height: 22, objectFit: "contain" as const, marginBottom: 6 },
    slipRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    slipLabel: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground },
    slipValue: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, textAlign: "right" as const },
    // Outstanding
    sectionTitle: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 },
    outstandingSection: { marginBottom: 14 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Top: Logo + Title ── */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 150 }}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.levyTitle}>Levy Notice</Text>
            <Text style={s.levySubtitle}>{referenceNumber}</Text>
            <Text style={s.levySubtitle}>{levyPeriod.start} — {levyPeriod.end}</Text>
          </View>
        </View>

        {/* ── Info row ── */}
        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issued for</Text>
              <Text style={s.infoValueBold}>{subdivision.name} ({subdivision.plan_number})</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Address</Text>
              <Text style={s.infoValue}>{subdivision.address}</Text>
            </View>
            {subdivision.abn ? (
              <View style={s.infoLine}>
                <Text style={s.infoLabel}>ABN</Text>
                <Text style={s.infoValue}>{subdivision.abn}</Text>
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

        {/* ── Line items (header bleeds to edges) ── */}
        <View style={{ marginBottom: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { flex: 4 }]}>Description</Text>
            <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRowStriped : s.tableRow}>
              <Text style={[s.tableCell, { flex: 4 }]}>{item.description}</Text>
              <Text style={[s.tableCellRight, { flex: 1 }]}>{fmt(item.amount)}</Text>
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
              <Text style={s.totalValue}>$0.00</Text>
            </View>
            <View style={s.totalDueRow}>
              <Text style={s.totalDueLabel}>Total amount due</Text>
              <Text style={s.totalDueValue}>{fmt(totalDue)}</Text>
            </View>
          </View>
        </View>

        {/* ── Due date ── */}
        <View style={s.dueRow}>
          <Text style={s.dueLabel}>Payment due</Text>
          <Text style={s.dueValue}>{dueDate}</Text>
        </View>

        {/* ── Outstanding balances ── */}
        {hasOutstanding ? (
          <View style={s.outstandingSection}>
            <Text style={s.sectionTitle}>Outstanding balances</Text>
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Reference</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Period</Text>
                <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
              </View>
              {outstandingBalances.map((bal, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRowStriped : s.tableRow}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{bal.reference}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{bal.period}</Text>
                  <Text style={[s.tableCellRight, { flex: 1, color: c.destructive }]}>{fmt(bal.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Tear line ── */}
        <View style={s.tearLine} />

        {/* ── Payment slip ── */}
        <View style={s.paymentSlip}>
          <View style={s.paymentLeft}>
            <Text style={s.paymentTitle}>Payment details</Text>

            <Text style={[s.bankLabel, { marginBottom: 6, width: "auto" as const }]}>Bank transfer</Text>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>BSB:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.bsb}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account No.:</Text>
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

            {paymentInstructions.bpay ? (
              <View style={{ marginTop: 12 }}>
                <Image src={BPAY_LOGO} style={s.bpayLogo} />
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Biller code:</Text>
                  <Text style={s.bankValue}>{paymentInstructions.bpay.biller_code}</Text>
                </View>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Reference:</Text>
                  <Text style={s.bankValue}>{paymentInstructions.bpay.reference}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={s.paymentRight}>
            <Text style={[s.ownerDetail, { fontFamily: FONT_BOLD, fontWeight: 600 }]}>
              {managementCompany.name}
            </Text>
            <Text style={[s.ownerDetail, { marginTop: 3 }]}>Lot {lotOwner.lot_number}</Text>
            <Text style={s.ownerDetail}>{subdivision.address}</Text>

            <View style={{ marginTop: 8, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 }}>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Total payable:</Text>
                <Text style={s.slipValue}>{fmt(totalDue)}</Text>
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
