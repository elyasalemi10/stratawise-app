import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { BudgetReportProps } from "../types";
import "../fonts";

// Budget Breakdown report. Visual structure: management-company letterhead
// at the top (logo + company name + contact lines on the left, "Budget
// Breakdown" title + period on the right), OC subtitle, then one section
// per fund (Administrative / Capital Works / Maintenance Plan) with a
// levy-style brand-coloured table header + striped rows + per-fund total,
// optional grand total when multi-fund, lot contributions table, then an
// approval note. Footer prints the management-company name and page number
// (no logo).

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

const FUND_SECTION_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

const BILLING_PERIODS_PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  annually: 1,
};

const PERIOD_LABEL: Record<string, string> = {
  monthly: "Per month",
  quarterly: "Per quarter",
  half_yearly: "Per half-year",
  annually: "Per year",
};

function fmtLot(lotNumber: number, unitNumber?: string | null): string {
  return unitNumber ? `Lot ${lotNumber} (Unit ${unitNumber})` : `Lot ${lotNumber}`;
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
  lots,
  billingCycle,
}: BudgetReportProps) {
  const brand = brandColors?.primary ?? "#1e7ec0"; // azure default

  // Group items by fund_type so multi-fund budgets render one section per
  // fund (Administrative, Capital Works, …) with a separator rule between.
  // Single-fund budgets still render with their fund name as the section
  // title (no generic "Expenditure" header).
  const fundOrder = ["administrative", "capital_works", "maintenance_plan"] as const;
  const grouped = new Map<string, { items: typeof items; total: number }>();
  for (const it of items) {
    const key = it.fund_type ?? "_single";
    const bucket = grouped.get(key) ?? { items: [], total: 0 };
    bucket.items.push(it);
    bucket.total += Number(it.amount);
    grouped.set(key, bucket);
  }
  const sortedFunds = Array.from(grouped.keys()).sort((a, b) => {
    const ai = fundOrder.indexOf(a as typeof fundOrder[number]);
    const bi = fundOrder.indexOf(b as typeof fundOrder[number]);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const isMultiFund = sortedFunds.length > 1;

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
    letterhead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 24,
    },
    letterheadLeft: { flex: 1 },
    headerLogo: { maxHeight: 48, maxWidth: 180, objectFit: "contain" as const, marginLeft: -40, marginBottom: 20 },
    companyName: { fontSize: 13, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    companyMeta: { fontSize: 8, color: c.muted, marginTop: 2, lineHeight: 1.4 },
    letterheadRight: { alignItems: "flex-end" as const, maxWidth: 240 },
    docTitleRight: {
      fontSize: 22,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      textAlign: "right" as const,
    },
    periodSubtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 4,
      textAlign: "right" as const,
    },

    // ── OC subtitle ──
    ocBlock: { marginTop: 24 },
    ocName: { fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand },
    ocAddress: { fontSize: 9, color: c.foreground, marginTop: 4, letterSpacing: 0.3 },

    // ── Fund section ──
    fundBlock: { marginTop: 22 },
    fundSeparator: {
      height: 1,
      backgroundColor: c.border,
      marginTop: 26,
    },
    fundTitle: {
      fontSize: 13,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      marginBottom: 8,
    },

    // ── Items table (levy-style) ──
    itemsTableHeader: {
      flexDirection: "row",
      backgroundColor: brand,
      paddingVertical: 9,
      marginHorizontal: -56,
      paddingLeft: 64,
      paddingRight: 64,
    },
    itemsHeaderCell: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.white },
    itemsRow: {
      flexDirection: "row",
      paddingVertical: 8,
      marginHorizontal: -56,
      paddingLeft: 64,
      paddingRight: 64,
    },
    itemsRowStriped: {
      flexDirection: "row",
      paddingVertical: 8,
      marginHorizontal: -56,
      paddingLeft: 64,
      paddingRight: 64,
      backgroundColor: c.stripe,
    },
    itemsCell: { fontSize: 9, color: c.foreground },
    itemsCellRight: { fontSize: 9, color: c.foreground, textAlign: "right" as const },

    // ── Fund total , extends to the same horizontal edges as the items
    //    table so the value column aligns with the brand-header "Amount"
    //    column above it. ──
    fundTotalRow: {
      flexDirection: "row",
      paddingTop: 8,
      paddingBottom: 2,
      marginHorizontal: -56,
      paddingLeft: 64,
      paddingRight: 64,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
      marginTop: 4,
    },
    fundTotalLabel: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    fundTotalValue: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    // ── Grand total (multi-fund only) , extended to the same horizontal
    //    edges as the items tables so the value aligns under the per-fund
    //    "Amount" column. ──
    grandTotalRule: { height: 2, backgroundColor: brand, marginTop: 28, marginHorizontal: -56 },
    grandTotalRow: {
      flexDirection: "row",
      paddingTop: 10,
      marginHorizontal: -56,
      paddingLeft: 64,
      paddingRight: 64,
    },
    grandTotalLabel: { fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand },
    grandTotalValue: { fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand, textAlign: "right" as const },

    // ── Lot contributions ──
    lotsBlock: { marginTop: 32 },
    lotsTitle: { fontSize: 13, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    lotsSubtitle: { fontSize: 9, color: c.muted, marginTop: 4, marginBottom: 8 },
    lotsTotalRow: {
      flexDirection: "row",
      paddingTop: 8,
      paddingBottom: 2,
      marginHorizontal: -56,
      paddingLeft: 64,
      paddingRight: 64,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
      marginTop: 4,
    },
    lotsTotalLabel: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    lotsTotalValue: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    // ── Approval note ──
    noteSection: {
      marginTop: 24,
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
  });

  const periodCopy = fmtPeriodLong(financialYear);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Letterhead , logo + company contact lines on the left,
            "Budget Breakdown" title + period on the right. ── */}
        <View style={s.letterhead}>
          <View style={s.letterheadLeft}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.headerLogo} />
            ) : null}
            <Text style={s.companyName}>{managementCompany.name}</Text>
            {managementCompany.address ? (
              <Text style={s.companyMeta}>{managementCompany.address}</Text>
            ) : null}
            {(managementCompany.phone || managementCompany.email) ? (
              <Text style={s.companyMeta}>
                {[managementCompany.phone, managementCompany.email].filter(Boolean).join("  ·  ")}
              </Text>
            ) : null}
            {managementCompany.abn ? (
              <Text style={s.companyMeta}>ABN {managementCompany.abn}</Text>
            ) : null}
          </View>
          <View style={s.letterheadRight}>
            <Text style={s.docTitleRight}>Budget Breakdown</Text>
            <Text style={s.periodSubtitle}>{periodCopy}</Text>
          </View>
        </View>

        {/* ── OC subtitle ── */}
        <View style={s.ocBlock}>
          <Text style={s.ocName}>
            {oc.name}{oc.plan_number ? ` , ${oc.plan_number}` : ""}
          </Text>
          <Text style={s.ocAddress}>{oc.address}</Text>
        </View>

        {/* ── One section per fund , fund name as the section title, then
            a levy-style brand-coloured table, then the fund's total. ── */}
        {sortedFunds.map((fundKey, idx) => {
          const bucket = grouped.get(fundKey)!;
          const sectionTitle = FUND_SECTION_LABEL[fundKey] ?? fundLabel ?? "Expenditure";
          const totalCopy = `Total ${sectionTitle}`;
          return (
            <View key={fundKey} style={idx === 0 ? s.fundBlock : undefined} wrap={false}>
              {idx > 0 && <View style={s.fundSeparator} />}
              <View style={idx > 0 ? s.fundBlock : undefined}>
                <Text style={s.fundTitle}>{sectionTitle}</Text>

                <View style={s.itemsTableHeader}>
                  <Text style={[s.itemsHeaderCell, { flex: 3 }]}>Description</Text>
                  <Text style={[s.itemsHeaderCell, { flex: 1.5, textAlign: "right" as const }]}>Amount</Text>
                </View>
                {bucket.items.map((it, i) => (
                  <View key={i} style={i % 2 === 0 ? s.itemsRowStriped : s.itemsRow}>
                    <Text style={[s.itemsCell, { flex: 3 }]}>{it.description || it.name}</Text>
                    <Text style={[s.itemsCellRight, { flex: 1.5 }]}>{fmt(it.amount)}</Text>
                  </View>
                ))}

                <View style={s.fundTotalRow}>
                  <Text style={[s.fundTotalLabel, { flex: 3 }]}>{totalCopy}</Text>
                  <Text style={[s.fundTotalValue, { flex: 1.5 }]}>{fmt(bucket.total)}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {/* Grand total only when there's more than one fund , single-fund
            already shows its own total above. */}
        {isMultiFund && (
          <>
            <View style={s.grandTotalRule} />
            <View style={s.grandTotalRow}>
              <Text style={[s.grandTotalLabel, { flex: 3 }]}>Total Budget</Text>
              <Text style={[s.grandTotalValue, { flex: 1.5 }]}>{fmt(totalAmount)}</Text>
            </View>
          </>
        )}

        {/* ── Lot contributions , per-lot share of the annual budget,
            calculated in proportion to each lot's liability. Lot rows use
            lot numbers only so the document stays accurate as ownership
            changes. ── */}
        {lots && lots.length > 0 ? (() => {
          const liabSafe = (l: { liability: number }) => l.liability > 0 ? l.liability : 1;
          const totalLiability = lots.reduce((s, l) => s + liabSafe(l), 0);
          const periods = BILLING_PERIODS_PER_YEAR[billingCycle ?? ""] ?? 1;
          const periodLabel = PERIOD_LABEL[billingCycle ?? ""] ?? "Per period";
          const showPerPeriod = periods > 1;

          const rows = lots.map((lot) => {
            const liab = liabSafe(lot);
            const proportion = liab / totalLiability;
            const annual = Math.round(totalAmount * proportion * 100) / 100;
            const perPeriod = Math.round((annual / periods) * 100) / 100;
            return { lot, annual, perPeriod };
          });

          const lotFlex = showPerPeriod ? 2.4 : 3;
          const liabFlex = 1;
          const numFlex = 1.4;

          return (
            <View style={s.lotsBlock}>
              <Text style={s.lotsTitle}>Lot contributions</Text>
              <Text style={s.lotsSubtitle}>
                Each lot&apos;s share of the annual budget, calculated in proportion to its liability.
              </Text>

              <View style={s.itemsTableHeader}>
                <Text style={[s.itemsHeaderCell, { flex: lotFlex }]}>Lot</Text>
                <Text style={[s.itemsHeaderCell, { flex: liabFlex, textAlign: "right" as const }]}>Liability</Text>
                <Text style={[s.itemsHeaderCell, { flex: numFlex, textAlign: "right" as const }]}>Annual share</Text>
                {showPerPeriod ? (
                  <Text style={[s.itemsHeaderCell, { flex: numFlex, textAlign: "right" as const }]}>{periodLabel}</Text>
                ) : null}
              </View>

              {rows.map((r, i) => (
                <View key={i} style={i % 2 === 0 ? s.itemsRowStriped : s.itemsRow}>
                  <Text style={[s.itemsCell, { flex: lotFlex }]}>
                    {fmtLot(r.lot.lot_number, r.lot.unit_number)}
                  </Text>
                  <Text style={[s.itemsCellRight, { flex: liabFlex }]}>
                    {liabSafe(r.lot)}
                  </Text>
                  <Text style={[s.itemsCellRight, { flex: numFlex }]}>{fmt(r.annual)}</Text>
                  {showPerPeriod ? (
                    <Text style={[s.itemsCellRight, { flex: numFlex }]}>{fmt(r.perPeriod)}</Text>
                  ) : null}
                </View>
              ))}

              <View style={s.lotsTotalRow}>
                <Text style={[s.lotsTotalLabel, { flex: lotFlex }]}>Total</Text>
                <Text style={[s.lotsTotalValue, { flex: liabFlex }]}>{totalLiability}</Text>
                <Text style={[s.lotsTotalValue, { flex: numFlex }]}>
                  {fmt(rows.reduce((s, r) => s + r.annual, 0))}
                </Text>
                {showPerPeriod ? (
                  <Text style={[s.lotsTotalValue, { flex: numFlex }]}>
                    {fmt(rows.reduce((s, r) => s + r.perPeriod, 0))}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })() : null}

        {approvalNote ? (
          <View style={s.noteSection}>
            <Text style={s.noteLabel}>Approval note</Text>
            <Text style={s.noteText}>{approvalNote}</Text>
          </View>
        ) : null}

        {/* ── Footer , company name (text only) + page number. ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{managementCompany.name}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
