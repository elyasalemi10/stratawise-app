import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { BudgetReportProps } from "../types";
import "../fonts"; // registers NunitoSans

// Branded budget report. Uses the same Nunito Sans + navy/gold palette as
// the levy notice so a manager looking at both side-by-side reads them as
// the same product. Customise via brandColors when management firms ship
// their own.

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
}: BudgetReportProps & { brandColors?: { primary: string; secondary: string } }) {
  const brand1 = brandColors?.primary ?? "#0E314C"; // SW midnight
  const brand2 = brandColors?.secondary ?? "#CFA753"; // SW gold

  const s = StyleSheet.create({
    page: {
      fontFamily: FONT,
      fontSize: 10,
      color: c.foreground,
      paddingTop: 28,
      paddingBottom: 36,
      paddingHorizontal: 24,
    },
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 18,
    },
    logo: { maxHeight: 60, maxWidth: 150, objectFit: "contain" as const },
    titleBlock: { alignItems: "flex-end" as const, maxWidth: 280 },
    title: {
      fontSize: 22,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      textAlign: "right" as const,
    },
    subtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 2,
      textAlign: "right" as const,
    },
    statusPill: {
      marginTop: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 999,
      fontSize: 9,
      fontFamily: FONT,
      fontWeight: 600,
      alignSelf: "flex-end" as const,
    },

    infoRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
      marginBottom: 18,
      gap: 20,
    },
    infoLine: { flexDirection: "row", marginBottom: 6 },
    infoLabel: { fontSize: 9, color: c.muted, width: 110 },
    infoValueBold: { fontSize: 10, fontFamily: FONT, fontWeight: 600, color: c.foreground, flex: 1 },

    noteSection: { marginBottom: 14, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: c.lightBg, borderRadius: 2 },
    noteLabel: { fontSize: 9, color: c.muted, marginBottom: 2 },
    noteText: { fontSize: 10, color: c.foreground, lineHeight: 1.5 },

    // Table , navy header strip extends to the page edges (same trick as
    // the levy notice: marginHorizontal: -24 plus padding back in).
    tableHeader: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableHeaderCellCode: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.white, width: 60 },
    tableHeaderCellName: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.white, flex: 1 },
    tableHeaderCellAmount: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.white, width: 110, textAlign: "right" as const },

    tableRow: {
      flexDirection: "row",
      paddingVertical: 8,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 8,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
      backgroundColor: c.stripe,
    },
    cellCode: { fontSize: 10, color: c.muted, width: 60 },
    cellName: { fontSize: 10, color: c.foreground, flex: 1 },
    cellAmount: { fontSize: 10, color: c.foreground, width: 110, textAlign: "right" as const },

    totalsBlock: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: 8,
    },
    totalsBox: { width: 240 },
    totalDueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderTopWidth: 1.5,
      borderTopColor: c.foreground,
    },
    totalDueLabel: { fontSize: 11, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    totalDueValue: { fontSize: 11, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    footer: {
      position: "absolute" as const,
      bottom: 16,
      left: 24,
      right: 24,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 8,
    },
    footerText: { fontSize: 8, color: c.muted },
    accentBar: {
      height: 4,
      backgroundColor: brand2,
      marginHorizontal: -24,
      marginBottom: 0,
    },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Top: Logo + Title block */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 150 }}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : (
              <Text style={{ fontSize: 14, fontFamily: FONT, fontWeight: 700, color: c.foreground }}>
                {managementCompany.name}
              </Text>
            )}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>Budget</Text>
            <Text style={s.subtitle}>{fundLabel}  ,  {financialYear}</Text>
            <Text style={s.subtitle}>{referenceNumber}</Text>
            <Text
              style={[
                s.statusPill,
                status === "approved"
                  ? { backgroundColor: "#dcfce7", color: "#166534" }
                  : { backgroundColor: "#fef3c7", color: "#92400e" },
              ]}
            >
              {status === "approved" ? "Approved" : "Draft"}
            </Text>
          </View>
        </View>

        {/* OC context */}
        <View style={s.infoRow}>
          <View style={{ flex: 1 }}>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>OC</Text>
              <Text style={s.infoValueBold}>{oc.name} {oc.plan_number}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Address</Text>
              <Text style={s.infoValueBold}>{oc.address}</Text>
            </View>
            {approvedAt ? (
              <View style={s.infoLine}>
                <Text style={s.infoLabel}>Approved</Text>
                <Text style={s.infoValueBold}>{fmtDate(approvedAt)}</Text>
              </View>
            ) : null}
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Generated</Text>
              <Text style={s.infoValueBold}>{fmtDate(date)}</Text>
            </View>
          </View>
        </View>

        {approvalNote ? (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>Approval note</Text>
            <Text style={s.noteText}>{approvalNote}</Text>
          </View>
        ) : null}

        {/* Items table */}
        <View style={s.tableHeader}>
          <Text style={s.tableHeaderCellCode}>Code</Text>
          <Text style={s.tableHeaderCellName}>Account</Text>
          <Text style={s.tableHeaderCellAmount}>Annual amount</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowStriped}>
            <Text style={s.cellCode}>{it.code ?? ""}</Text>
            <Text style={s.cellName}>{it.description || it.name}</Text>
            <Text style={s.cellAmount}>{fmt(it.amount)}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={s.totalsBlock}>
          <View style={s.totalsBox}>
            <View style={s.totalDueRow}>
              <Text style={s.totalDueLabel}>Total annual</Text>
              <Text style={s.totalDueValue}>{fmt(totalAmount)}</Text>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>{managementCompany.name}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
        {/* Gold accent strip at the very bottom for brand polish */}
        <View style={s.accentBar} fixed render={() => <View style={s.accentBar} />} />
      </Page>
    </Document>
  );
}
