import React from "react";
import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import type { LevyNoticeProps } from "../types";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  white: "#ffffff",
  primary: "#2b7fff",
  destructive: "#ef4444",
  green: "#00bd7d",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    color: c.foreground,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 40,
  },

  // ── Top section: logo + title + company details ──
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    flex: 1,
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

  // ── Info row: plan details + owner box ──
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
  infoLabel: {
    fontSize: 8,
    color: c.muted,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 9,
    color: c.foreground,
    marginBottom: 8,
  },
  infoValueBold: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    marginBottom: 8,
  },
  ownerBox: {
    flex: 1,
    backgroundColor: c.lightBg,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    borderRadius: 2,
  },
  ownerTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: c.muted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  ownerName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    marginBottom: 3,
  },
  ownerDetail: {
    fontSize: 9,
    color: c.foreground,
    lineHeight: 1.5,
  },

  // ── Line items table ──
  table: {
    marginBottom: 16,
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
  tableCell: {
    fontSize: 9,
    color: c.foreground,
  },
  tableCellRight: {
    fontSize: 9,
    color: c.foreground,
    textAlign: "right" as const,
  },

  // ── Totals ──
  totalsSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 16,
  },
  totalsBlock: {
    width: 220,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 9,
    color: c.muted,
  },
  totalValue: {
    fontSize: 9,
    color: c.foreground,
    textAlign: "right" as const,
  },
  totalDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderTopWidth: 1.5,
    borderTopColor: c.foreground,
    marginTop: 2,
  },
  totalDueLabel: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
  },
  totalDueValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    textAlign: "right" as const,
  },

  // ── Due date highlight ──
  dueBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: c.lightBg,
    borderWidth: 1,
    borderColor: c.border,
    padding: 10,
    borderRadius: 2,
    marginBottom: 20,
  },
  dueLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
  },
  dueValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: c.primary,
  },

  // ── Payment slip (bottom section) ──
  tearLine: {
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    borderStyle: "dashed" as const,
    marginVertical: 20,
  },
  paymentSlip: {
    flexDirection: "row",
    gap: 30,
  },
  paymentLeft: {
    flex: 1,
  },
  paymentRight: {
    flex: 1,
    backgroundColor: c.lightBg,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    borderRadius: 2,
  },
  paymentTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    marginBottom: 8,
  },
  paymentNote: {
    fontSize: 8,
    color: c.muted,
    lineHeight: 1.5,
    marginBottom: 12,
  },
  bankLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    marginBottom: 1,
  },
  bankValue: {
    fontSize: 9,
    color: c.foreground,
    marginBottom: 6,
  },
  slipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  slipLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
  },
  slipValue: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    textAlign: "right" as const,
  },

  // ── Outstanding / penalty ──
  outstandingSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: c.foreground,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  penaltyNote: {
    fontSize: 8,
    color: c.muted,
    fontStyle: "italic" as const,
    marginTop: 8,
    lineHeight: 1.4,
  },

  // ── Footer ──
  footer: {
    position: "absolute" as const,
    bottom: 16,
    left: 40,
    right: 40,
  },
  footerText: {
    fontSize: 7,
    color: c.muted,
    textAlign: "center" as const,
  },
});

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
  penaltyInterestRate,
}: LevyNoticeProps) {
  const hasOutstanding = outstandingBalances && outstandingBalances.length > 0;
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Top: Logo + Title + Company ── */}
        <View style={s.topRow}>
          <View style={s.topLeft}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : null}
          </View>

          <View style={s.titleBlock}>
            <Text style={s.levyTitle}>Levy Notice</Text>
            <Text style={s.levySubtitle}>No. {referenceNumber}</Text>
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

        {/* ── Info row: plan + owner box ── */}
        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <Text style={s.infoLabel}>Issued on behalf of</Text>
            <Text style={s.infoValueBold}>
              The Owners — {subdivision.name}
            </Text>

            <Text style={s.infoLabel}>Plan number</Text>
            <Text style={s.infoValue}>{subdivision.plan_number}</Text>

            <Text style={s.infoLabel}>Issue date</Text>
            <Text style={s.infoValue}>{fmtDate(date)}</Text>

            <Text style={s.infoLabel}>Due date</Text>
            <Text style={s.infoValueBold}>{dueDate}</Text>
          </View>

          <View style={s.ownerBox}>
            <Text style={s.ownerTitle}>Issued to</Text>
            <Text style={s.ownerName}>{lotOwner.name}</Text>
            <Text style={s.ownerDetail}>{lotOwner.address}</Text>
            <Text style={s.ownerDetail}>Lot {lotOwner.lot_number}</Text>
          </View>
        </View>

        {/* ── Line items ── */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { flex: 4 }]}>Description</Text>
            <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={s.tableRow}>
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

        {/* ── Due date box ── */}
        <View style={s.dueBox}>
          <Text style={s.dueLabel}>Payment due</Text>
          <Text style={s.dueValue}>{dueDate}</Text>
        </View>

        {/* ── Outstanding balances ── */}
        {hasOutstanding ? (
          <View style={s.outstandingSection}>
            <Text style={s.sectionTitle}>Outstanding balances</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Reference</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Period</Text>
                <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
              </View>
              {outstandingBalances.map((bal, i) => (
                <View key={i} style={s.tableRow}>
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

        {/* ── Penalty interest ── */}
        {penaltyInterestRate != null && penaltyInterestRate > 0 ? (
          <Text style={s.penaltyNote}>
            Interest of up to {penaltyInterestRate}% per month may be charged on
            overdue amounts in accordance with the Owners Corporations Act 2006 (Vic).
          </Text>
        ) : null}

        {/* ── Tear line ── */}
        <View style={s.tearLine} />

        {/* ── Payment slip ── */}
        <View style={s.paymentSlip}>
          <View style={s.paymentLeft}>
            <Text style={s.paymentTitle}>Strata levy payment</Text>
            <Text style={s.paymentNote}>
              Please refer to your unique reference number when paying levies
              by bank transfer.{"\n"}
              Should debt recovery become necessary, all associated costs will
              be added to the debt.
            </Text>

            <Text style={s.bankLabel}>Bank transfer</Text>
            <View style={{ marginTop: 4 }}>
              <View style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={[s.bankLabel, { width: 80 }]}>BSB:</Text>
                <Text style={s.bankValue}>{paymentInstructions.eft.bsb}</Text>
              </View>
              <View style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={[s.bankLabel, { width: 80 }]}>Account No.:</Text>
                <Text style={s.bankValue}>{paymentInstructions.eft.account_number}</Text>
              </View>
              <View style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={[s.bankLabel, { width: 80 }]}>Account name:</Text>
                <Text style={s.bankValue}>{paymentInstructions.eft.account_name}</Text>
              </View>
              <View style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={[s.bankLabel, { width: 80 }]}>Reference:</Text>
                <Text style={s.bankValue}>{paymentInstructions.eft.reference}</Text>
              </View>
            </View>

            {paymentInstructions.bpay ? (
              <View style={{ marginTop: 8 }}>
                <Text style={s.bankLabel}>BPAY</Text>
                <View style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: "row", marginBottom: 3 }}>
                    <Text style={[s.bankLabel, { width: 80 }]}>Biller code:</Text>
                    <Text style={s.bankValue}>{paymentInstructions.bpay.biller_code}</Text>
                  </View>
                  <View style={{ flexDirection: "row", marginBottom: 3 }}>
                    <Text style={[s.bankLabel, { width: 80 }]}>Reference:</Text>
                    <Text style={s.bankValue}>{paymentInstructions.bpay.reference}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          <View style={s.paymentRight}>
            <Text style={s.companyName}>{managementCompany.name}</Text>
            <Text style={[s.ownerDetail, { marginTop: 4 }]}>
              Lot {lotOwner.lot_number}
            </Text>
            <Text style={s.ownerDetail}>{subdivision.address}</Text>

            <View style={{ marginTop: 10, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 8 }}>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Total amount payable:</Text>
                <Text style={s.slipValue}>{fmt(totalDue)}</Text>
              </View>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Due date:</Text>
                <Text style={s.slipValue}>{dueDate}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {managementCompany.name} · Reference: {referenceNumber} · Generated {fmtDate(date)}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
