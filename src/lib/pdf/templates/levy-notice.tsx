import React from "react";
import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import type { LevyNoticeProps } from "../types";

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
      paddingTop: 36,
      paddingBottom: 24,
      paddingHorizontal: 40,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 20,
    },
    logo: {
      maxHeight: 48,
      maxWidth: 100,
      objectFit: "contain" as const,
    },
    titleBlock: {
      alignItems: "center" as const,
      flex: 1,
    },
    levyTitle: {
      fontSize: 18,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      textAlign: "center" as const,
    },
    levySubtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 4,
      textAlign: "center" as const,
    },
    topRight: {
      alignItems: "flex-end" as const,
      maxWidth: 180,
    },
    companyName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      textAlign: "right" as const,
    },
    companyDetail: {
      fontSize: 8,
      color: c.muted,
      textAlign: "right" as const,
      marginTop: 1.5,
      lineHeight: 1.4,
    },
    infoRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 14,
      marginBottom: 20,
      gap: 20,
    },
    infoLeft: {
      flex: 1,
    },
    infoLine: {
      flexDirection: "row",
      marginBottom: 5,
    },
    infoLabel: {
      fontSize: 8,
      color: c.muted,
      width: 70,
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
    ownerTitle: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: c.muted,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
      marginBottom: 4,
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
      borderBottomWidth: 1.5,
      borderBottomColor: c.foreground,
      paddingBottom: 5,
      marginBottom: 2,
    },
    tableHeaderCell: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: c.foreground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
      backgroundColor: c.stripe,
    },
    tableCell: { fontSize: 9, color: c.foreground },
    tableCellRight: { fontSize: 9, color: c.foreground, textAlign: "right" as const },
    totalsSection: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 16,
      marginTop: 4,
    },
    totalsBlock: { width: 220 },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    totalRowBrand: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
      paddingHorizontal: 6,
      backgroundColor: brand1 + "12",
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
      justifyContent: "space-between",
      paddingVertical: 8,
      marginBottom: 16,
    },
    dueLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: c.foreground },
    dueValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: brand1 },
    tearLine: {
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      borderStyle: "dashed" as const,
      marginVertical: 16,
    },
    paymentSlip: { flexDirection: "row", gap: 24 },
    paymentLeft: { flex: 1 },
    paymentRight: {
      width: 200,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
    },
    paymentTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: c.foreground, marginBottom: 8 },
    bankRow: { flexDirection: "row", marginBottom: 3 },
    bankLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: c.foreground, width: 80 },
    bankValue: { fontSize: 9, color: c.foreground },
    bpayLogo: { width: 40, height: 16, objectFit: "contain" as const, marginBottom: 6 },
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
    outstandingSection: { marginBottom: 16 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Top: Logo + Title + Company ── */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 100 }}>
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

          <View style={s.topRight}>
            <Text style={s.companyName}>{managementCompany.name}</Text>
            <Text style={s.companyDetail}>{subdivision.address}</Text>
            {subdivision.abn ? (
              <Text style={s.companyDetail}>ABN {subdivision.abn}</Text>
            ) : null}
          </View>
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
              <Text style={s.infoLabel}>Issue date</Text>
              <Text style={s.infoValue}>{fmtDate(date)}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Due date</Text>
              <Text style={s.infoValueBold}>{dueDate}</Text>
            </View>
          </View>

          <View style={s.ownerBox}>
            <Text style={s.ownerTitle}>Issued to</Text>
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
            <View style={s.totalRowBrand}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{fmt(subtotal)}</Text>
            </View>
            <View style={s.totalRowBrand}>
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
                <Image src="/bank-logos/bpay-logo.webp" style={s.bpayLogo} />
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
