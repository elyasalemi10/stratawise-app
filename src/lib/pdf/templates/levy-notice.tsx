import React from "react";
import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import type { LevyNoticeProps } from "../types";

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
      fontFamily: "Helvetica",
      fontSize: 9,
      color: c.foreground,
      paddingTop: 28,
      paddingBottom: 20,
      paddingHorizontal: 28,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 18,
    },
    logo: {
      maxHeight: 56,
      maxWidth: 140,
      objectFit: "contain" as const,
    },
    titleBlock: {
      alignItems: "center" as const,
      flex: 1,
    },
    levyTitle: {
      fontSize: 20,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      textAlign: "center" as const,
    },
    levySubtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 3,
      textAlign: "center" as const,
    },
    infoRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
      marginBottom: 18,
      gap: 20,
    },
    infoLeft: {
      flex: 1,
    },
    infoLine: {
      flexDirection: "row",
      marginBottom: 4,
    },
    infoLabel: {
      fontSize: 8,
      color: c.muted,
      width: 60,
    },
    infoValue: {
      fontSize: 9,
      color: c.foreground,
      flex: 1,
    },
    infoValueBold: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      flex: 1,
    },
    ownerBox: {
      flex: 1,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
    },
    ownerName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      marginBottom: 2,
    },
    ownerDetail: {
      fontSize: 9,
      color: c.foreground,
      lineHeight: 1.4,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    tableHeaderCell: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: c.white,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
      backgroundColor: c.stripe,
    },
    tableCell: { fontSize: 9, color: c.foreground },
    tableCellRight: { fontSize: 9, color: c.foreground, textAlign: "right" as const },
    totalsSection: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 14,
      marginTop: 4,
    },
    totalsBlock: { width: 220 },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
      paddingHorizontal: 6,
    },
    totalLabel: { fontSize: 9, color: c.muted },
    totalValue: { fontSize: 9, color: c.foreground, textAlign: "right" as const },
    totalDueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderTopWidth: 1.5,
      borderTopColor: c.foreground,
      marginTop: 2,
    },
    totalDueLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: c.foreground },
    totalDueValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: c.foreground, textAlign: "right" as const },
    dueRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center" as const,
      marginBottom: 14,
      gap: 12,
    },
    dueLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: c.foreground },
    dueValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: brand2 },
    tearLine: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      borderStyle: "dashed" as const,
      marginVertical: 14,
    },
    paymentSlip: { flexDirection: "row", gap: 20 },
    paymentLeft: { flex: 1 },
    paymentRight: {
      width: 200,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
    },
    paymentTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: c.foreground, marginBottom: 6 },
    bankRow: { flexDirection: "row", marginBottom: 3 },
    bankLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: c.foreground, width: 80 },
    bankValue: { fontSize: 9, color: c.foreground },
    bpayLogo: { width: 50, height: 20, objectFit: "contain" as const, marginBottom: 4 },
    slipRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    slipLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: c.foreground },
    slipValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: c.foreground, textAlign: "right" as const },
    sectionTitle: {
      fontSize: 9,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    outstandingSection: { marginBottom: 14 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Top: Logo + Title ── */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 140 }}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : null}
          </View>

          <View style={s.titleBlock}>
            <Text style={s.levyTitle}>Levy Notice</Text>
            <Text style={s.levySubtitle}>{referenceNumber}</Text>
            <Text style={s.levySubtitle}>
              {levyPeriod.start} — {levyPeriod.end}
            </Text>
          </View>

          {/* Empty right column to balance the layout */}
          <View style={{ maxWidth: 140 }} />
        </View>

        {/* ── Info row ── */}
        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issued for</Text>
              <Text style={s.infoValueBold}>
                {subdivision.name} ({subdivision.plan_number})
              </Text>
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

        {/* ── Line items ── */}
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
                  <Text style={[s.tableCellRight, { flex: 1, color: c.destructive }]}>
                    {fmt(bal.amount)}
                  </Text>
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

            <Text style={[s.bankLabel, { marginBottom: 4, width: "auto" as const }]}>Bank transfer</Text>
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
              <View style={{ marginTop: 10 }}>
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
            <Text style={[s.ownerDetail, { fontFamily: "Helvetica-Bold" }]}>
              {managementCompany.name}
            </Text>
            <Text style={[s.ownerDetail, { marginTop: 3 }]}>
              Lot {lotOwner.lot_number}
            </Text>
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
