import { Page, View, Text, Image, Document, StyleSheet, Svg, Path, Circle } from "@react-pdf/renderer";
import type { BudgetReportProps } from "../types";
import "../fonts";

// Proposed Annual Budget report, single-fund layout. Visual reference is the
// classic "Proposed Annual Budget" sheet used across the Australian strata
// industry: title on the left + fund label on the right, brand-blue rule,
// OC + period subtitle, address line, gold circle-arrow icon next to each
// section header, right-aligned amount column, bold total row with a black
// rule above. Builds in the firm's brand colour when set.

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  hairline: "#0f0f0f",
  white: "#ffffff",
  stripe: "#f5f7fa",
};

const FONT = "NunitoSans";

function fmt(amount: number): string {
  if (amount === 0) return "-";
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `(${formatted})` : formatted;
}

function fmtPeriodLong(financialYear: string): string {
  // "2025-2026" → "1 July 2025 to 30 June 2026" (default VIC FY); falls back
  // to a generic "1 July 2025 to 30 June 2026" pattern.
  const [s, e] = financialYear.split("-").map((p) => parseInt(p, 10));
  if (!s || !e) return financialYear;
  return `1 July ${s} to 30 June ${e}`;
}

// Gold circle-with-arrow that flags each section header. Matches the
// reference doc's visual rhythm of "icon → section heading → table".
function SectionIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} stroke={color} strokeWidth={1.8} fill="none" />
      <Path
        d="M7 12 H15 M11 8 L15 12 L11 16"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BudgetReport({
  managementCompany,
  oc,
  financialYear,
  fundLabel,
  approvalNote,
  items,
  totalAmount,
  brandColors,
}: BudgetReportProps) {
  const brand = brandColors?.primary ?? "#1e7ec0"; // azure default
  const accent = brandColors?.secondary ?? "#E89A1A"; // gold for the section icon

  const s = StyleSheet.create({
    page: {
      fontFamily: FONT,
      fontSize: 9,
      color: c.foreground,
      paddingTop: 50,
      paddingBottom: 40,
      paddingHorizontal: 56,
    },

    // ── Letterhead ──
    titleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    titleLeft: { flex: 1 },
    titleRight: { alignItems: "flex-end" as const, maxWidth: 280 },
    docTitle: { fontSize: 22, fontFamily: FONT, fontWeight: 600, color: c.foreground },
    fundLabel: { fontSize: 13, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    rule: { height: 1, backgroundColor: brand, marginTop: 6 },

    subtitleRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginTop: 12,
    },
    ocName: { fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand },
    ocAddress: { fontSize: 9, color: c.foreground, marginTop: 4, letterSpacing: 0.3 },
    period: { fontSize: 11, fontFamily: FONT, fontWeight: 700, color: brand },

    // ── Section header ──
    sectionRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: 40,
      gap: 14,
    },
    sectionIcon: { width: 26, height: 26 },
    sectionHeader: { flexDirection: "row", flex: 1, alignItems: "flex-end" },
    sectionTitle: { fontSize: 14, fontFamily: FONT, fontWeight: 700, color: c.foreground, flex: 1 },
    columnHead: {
      fontSize: 9,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      textAlign: "right" as const,
      width: 110,
    },
    sectionUnderline: { height: 1, backgroundColor: c.hairline, marginTop: 6 },

    // ── Item rows ──
    item: {
      flexDirection: "row",
      paddingVertical: 4,
      paddingLeft: 40, // matches the icon's right edge so item names line up
    },
    itemName: { flex: 1, fontSize: 9, color: c.foreground },
    itemAmount: { width: 110, fontSize: 9, color: c.foreground, textAlign: "right" as const },

    totalRule: { height: 1, backgroundColor: c.hairline, marginTop: 8, marginLeft: 40 },
    totalRow: {
      flexDirection: "row",
      paddingTop: 8,
      paddingLeft: 40,
    },
    totalLabel: { flex: 1, fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    totalValue: { width: 110, fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    // ── Approval note ──
    noteSection: {
      marginTop: 24,
      marginLeft: 40,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: c.stripe,
      borderLeftWidth: 3,
      borderLeftColor: brand,
      borderRadius: 2,
    },
    noteLabel: { fontSize: 8, color: c.muted, fontFamily: FONT, fontWeight: 600 },
    noteText: { fontSize: 9, color: c.foreground, lineHeight: 1.5, marginTop: 2 },

    // ── Footer ──
    footer: {
      position: "absolute" as const,
      bottom: 22,
      left: 56,
      right: 56,
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    footerText: { fontSize: 8, color: c.muted },
    logoSlot: { maxHeight: 32, maxWidth: 120, objectFit: "contain" as const },
  });

  const periodCopy = fmtPeriodLong(financialYear);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Title + fund label ── */}
        <View style={s.titleRow}>
          <View style={s.titleLeft}>
            <Text style={s.docTitle}>Proposed Annual Budget</Text>
          </View>
          <View style={s.titleRight}>
            <Text style={s.fundLabel}>{fundLabel}</Text>
          </View>
        </View>
        <View style={s.rule} />

        {/* ── OC subtitle ── */}
        <View style={s.subtitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.ocName}>
              {oc.name}
              {oc.plan_number ? ` , ${oc.plan_number}` : ""}
            </Text>
            <Text style={s.ocAddress}>{oc.address}</Text>
          </View>
          <Text style={s.period}>{periodCopy}</Text>
        </View>

        {/* ── Expenditure section ── */}
        <View style={s.sectionRow}>
          <View style={s.sectionIcon}>
            <SectionIcon color={accent} />
          </View>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Expenditure</Text>
            <Text style={s.columnHead}>Amount</Text>
          </View>
        </View>
        <View style={[s.sectionUnderline, { marginLeft: 40 }]} />

        {items.map((it, i) => (
          <View key={i} style={s.item}>
            <Text style={s.itemName}>
              {it.code ? `${it.code}  ·  ` : ""}{it.description || it.name}
            </Text>
            <Text style={s.itemAmount}>{fmt(it.amount)}</Text>
          </View>
        ))}

        <View style={s.totalRule} />
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total {fundLabel} Expenditure</Text>
          <Text style={s.totalValue}>{fmt(totalAmount)}</Text>
        </View>

        {approvalNote ? (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>Approval note</Text>
            <Text style={s.noteText}>{approvalNote}</Text>
          </View>
        ) : null}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logoSlot} />
            ) : (
              <Text style={s.footerText}>{managementCompany.name}</Text>
            )}
          </View>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
