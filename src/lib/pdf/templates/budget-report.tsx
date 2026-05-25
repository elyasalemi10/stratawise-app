import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { BudgetReportProps } from "../types";
import "../fonts";

// Branded report-style budget. Three-section layout:
//   1. Letterhead , firm logo on the left, document title + reference on
//      the right, brand-color hairline underneath.
//   2. Executive summary , the four numbers a strata manager actually
//      cares about (total, item count, status, period) shown as a clean
//      key-value strip, no chrome.
//   3. Detail table , navy header strip (or brand color), striped rows,
//      total row in bold.
// Footer page numbers + a thin gold accent rule at the bottom.
//
// brand_color from management_companies feeds into brand1; if unset the
// template falls back to SW midnight so firms without a brand still get a
// polished doc.

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  stripe: "#f5f7fa",
  white: "#ffffff",
};

const FONT = "NunitoSans";

function fmt(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function BudgetReport({
  managementCompany,
  oc,
  referenceNumber,
  date,
  financialYear,
  fundLabel,
  status,
  approvedAt,
  approvalNote,
  items,
  totalAmount,
  brandColors,
}: BudgetReportProps) {
  const brand1 = brandColors?.primary ?? "#0E314C";
  const brand2 = brandColors?.secondary ?? "#CFA753";

  const s = StyleSheet.create({
    page: {
      fontFamily: FONT,
      fontSize: 10,
      color: c.foreground,
      paddingTop: 28,
      paddingBottom: 40,
      paddingHorizontal: 28,
    },

    // ── Letterhead ──
    letterhead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    letterheadLeft: { maxWidth: 200 },
    logo: { maxHeight: 56, maxWidth: 200, objectFit: "contain" as const },
    firmName: { fontSize: 14, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    letterheadRight: { alignItems: "flex-end" as const, maxWidth: 280 },
    docType: {
      fontSize: 9,
      letterSpacing: 1,
      color: brand1,
      fontFamily: FONT,
      fontWeight: 700,
      textTransform: "uppercase" as const,
    },
    title: {
      fontSize: 22,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      textAlign: "right" as const,
      marginTop: 2,
    },
    subtitle: { fontSize: 10, color: c.muted, marginTop: 2, textAlign: "right" as const },
    reference: { fontSize: 9, color: c.muted, marginTop: 4, textAlign: "right" as const },
    brandRule: { height: 3, backgroundColor: brand1, marginTop: 16, marginHorizontal: -28 },

    // ── Executive summary strip ──
    summaryRow: {
      flexDirection: "row",
      marginTop: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 4,
      backgroundColor: c.lightBg,
    },
    summaryCell: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRightWidth: 1,
      borderRightColor: c.border,
    },
    summaryCellLast: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
    summaryLabel: {
      fontSize: 8,
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
      color: c.muted,
      fontFamily: FONT,
      fontWeight: 600,
    },
    summaryValue: {
      fontSize: 13,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      marginTop: 4,
    },
    summaryValueAccent: {
      fontSize: 13,
      fontFamily: FONT,
      fontWeight: 700,
      color: brand1,
      marginTop: 4,
    },

    // ── OC context ──
    contextSection: { marginBottom: 14 },
    contextHeading: {
      fontSize: 8,
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
      color: c.muted,
      fontFamily: FONT,
      fontWeight: 600,
      marginBottom: 4,
    },
    contextLine: { fontSize: 10, color: c.foreground, fontFamily: FONT, fontWeight: 600 },
    contextLineMuted: { fontSize: 9, color: c.muted, marginTop: 2 },

    // ── Approval note ──
    noteSection: {
      marginBottom: 14,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: c.lightBg,
      borderLeftWidth: 3,
      borderLeftColor: brand2,
      borderRadius: 2,
    },
    noteLabel: { fontSize: 9, color: c.muted, marginBottom: 2 },
    noteText: { fontSize: 10, color: c.foreground, lineHeight: 1.5 },

    // ── Detail table ──
    tableHeading: {
      fontSize: 8,
      letterSpacing: 0.5,
      textTransform: "uppercase" as const,
      color: c.muted,
      fontFamily: FONT,
      fontWeight: 600,
      marginBottom: 6,
    },
    tableHeaderRow: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 10,
      marginHorizontal: -28,
      paddingLeft: 36,
      paddingRight: 36,
    },
    th: { color: c.white, fontFamily: FONT, fontWeight: 700, fontSize: 10 },
    thCode: { width: 60 },
    thName: { flex: 1 },
    thAmount: { width: 110, textAlign: "right" as const },

    tableRow: {
      flexDirection: "row",
      paddingVertical: 7,
      marginHorizontal: -28,
      paddingLeft: 36,
      paddingRight: 36,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 7,
      marginHorizontal: -28,
      paddingLeft: 36,
      paddingRight: 36,
      backgroundColor: c.stripe,
    },
    cellCode: { width: 60, fontSize: 9, color: c.muted, fontFamily: FONT },
    cellName: { flex: 1, fontSize: 10, color: c.foreground, fontFamily: FONT },
    cellAmount: { width: 110, fontSize: 10, color: c.foreground, fontFamily: FONT, textAlign: "right" as const },

    totalRow: {
      flexDirection: "row",
      marginHorizontal: -28,
      paddingLeft: 36,
      paddingRight: 36,
      paddingVertical: 10,
      borderTopWidth: 2,
      borderTopColor: c.foreground,
    },
    totalLabel: { flex: 1, fontSize: 11, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    totalValue: { width: 110, fontSize: 12, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    // ── Footer ──
    footer: {
      position: "absolute" as const,
      bottom: 20,
      left: 28,
      right: 28,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footerText: { fontSize: 8, color: c.muted },
    accentBar: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: 3,
      backgroundColor: brand2,
    },
  });

  const periodLabel = `${fundLabel}  ,  ${financialYear}`;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Letterhead ── */}
        <View style={s.letterhead}>
          <View style={s.letterheadLeft}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : (
              <Text style={s.firmName}>{managementCompany.name}</Text>
            )}
          </View>
          <View style={s.letterheadRight}>
            <Text style={s.docType}>Annual Budget Report</Text>
            <Text style={s.title}>{financialYear}</Text>
            <Text style={s.subtitle}>{fundLabel}</Text>
            <Text style={s.reference}>{referenceNumber}</Text>
          </View>
        </View>
        <View style={s.brandRule} />

        {/* ── Executive summary ── */}
        <View style={s.summaryRow}>
          <View style={s.summaryCell}>
            <Text style={s.summaryLabel}>Total annual</Text>
            <Text style={s.summaryValueAccent}>{fmt(totalAmount)}</Text>
          </View>
          <View style={s.summaryCell}>
            <Text style={s.summaryLabel}>Line items</Text>
            <Text style={s.summaryValue}>{items.length}</Text>
          </View>
          <View style={s.summaryCell}>
            <Text style={s.summaryLabel}>Status</Text>
            <Text style={s.summaryValue}>{status === "approved" ? "Approved" : "Draft"}</Text>
          </View>
          <View style={s.summaryCellLast}>
            <Text style={s.summaryLabel}>Period</Text>
            <Text style={s.summaryValue}>{periodLabel}</Text>
          </View>
        </View>

        {/* ── OC context ── */}
        <View style={s.contextSection}>
          <Text style={s.contextHeading}>Owners Corporation</Text>
          <Text style={s.contextLine}>{oc.name} {oc.plan_number}</Text>
          <Text style={s.contextLineMuted}>{oc.address}</Text>
          <Text style={s.contextLineMuted}>
            Issued {fmtDate(date)}
            {approvedAt ? `  ,  Approved ${fmtDate(approvedAt)}` : ""}
          </Text>
        </View>

        {approvalNote ? (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>Approval note</Text>
            <Text style={s.noteText}>{approvalNote}</Text>
          </View>
        ) : null}

        {/* ── Detail table ── */}
        <Text style={s.tableHeading}>Budget detail</Text>
        <View style={s.tableHeaderRow}>
          <Text style={[s.th, s.thCode]}>Code</Text>
          <Text style={[s.th, s.thName]}>Account</Text>
          <Text style={[s.th, s.thAmount]}>Annual amount</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowStriped}>
            <Text style={s.cellCode}>{it.code ?? ""}</Text>
            <Text style={s.cellName}>{it.description || it.name}</Text>
            <Text style={s.cellAmount}>{fmt(it.amount)}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total annual</Text>
          <Text style={s.totalValue}>{fmt(totalAmount)}</Text>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{managementCompany.name}  ,  {referenceNumber}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
        <View style={s.accentBar} fixed />
      </Page>
    </Document>
  );
}
