import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { BudgetReportProps } from "../types";
import "../fonts";

// Budget Breakdown report. Visual structure: management-company letterhead
// at the top (logo + company name + contact lines on the left, fund label
// on the right), brand-coloured rule, OC subtitle, then one expenditure
// section per fund with a totals row and an optional grand total.

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
  // Single-fund budgets fall through to a single "Expenditure" section.
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
    headerLogo: { maxHeight: 48, maxWidth: 180, objectFit: "contain" as const, marginLeft: -16, marginBottom: 20 },
    companyName: { fontSize: 13, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    companyMeta: { fontSize: 8, color: c.muted, marginTop: 2, lineHeight: 1.4 },
    letterheadRight: { alignItems: "flex-end" as const, maxWidth: 220 },
    fundLabel: { fontSize: 12, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    titleBlock: { marginTop: 20 },
    docTitle: { fontSize: 22, fontFamily: FONT, fontWeight: 600, color: c.foreground },
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

    // ── Section header (no icon , the brand rule above is the only
    //    decoration; section title sits flush-left so the table stays
    //    aligned with the page edge). ──
    sectionRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: 32,
    },
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
    },
    itemName: { flex: 1, fontSize: 9, color: c.foreground },
    itemAmount: { width: 110, fontSize: 9, color: c.foreground, textAlign: "right" as const },

    totalRule: { height: 1, backgroundColor: c.hairline, marginTop: 8 },
    totalRow: {
      flexDirection: "row",
      paddingTop: 8,
    },
    totalLabel: { flex: 1, fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    totalValue: { width: 110, fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    // ── Fund separator (multi-fund only) ──
    fundSeparator: {
      height: 1,
      backgroundColor: c.border,
      marginTop: 28,
    },

    // ── Grand total (multi-fund) ──
    grandTotalRule: { height: 2, backgroundColor: brand, marginTop: 28 },
    grandTotalRow: {
      flexDirection: "row",
      paddingTop: 10,
    },
    grandTotalLabel: { flex: 1, fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand },
    grandTotalValue: { width: 110, fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand, textAlign: "right" as const },

    // ── Lot contributions table ──
    lotsSectionRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginTop: 32,
    },
    lotsSectionTitle: { fontSize: 14, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    lotsSubtitle: { fontSize: 9, color: c.muted, marginTop: 4 },
    lotsTableHead: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
      paddingBottom: 6,
      marginTop: 10,
    },
    lotsTh: { fontSize: 9, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    lotsThRight: { fontSize: 9, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },
    lotsRow: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
    },
    lotsRowStriped: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: c.border,
      backgroundColor: c.stripe,
    },
    lotsCell: { fontSize: 9, color: c.foreground },
    lotsCellRight: { fontSize: 9, color: c.foreground, textAlign: "right" as const },
    lotsTotalRow: {
      flexDirection: "row",
      paddingTop: 8,
      paddingBottom: 4,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
      marginTop: 2,
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
    logoSlot: { maxHeight: 32, maxWidth: 120, objectFit: "contain" as const },
  });

  const periodCopy = fmtPeriodLong(financialYear);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Management-company letterhead , logo + company name +
            contact lines on the left, fund label on the right. ── */}
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
            <Text style={s.fundLabel}>{fundLabel}</Text>
            <Text style={[s.companyMeta, { marginTop: 4 }]}>{periodCopy}</Text>
          </View>
        </View>

        {/* ── Document title ── */}
        <View style={s.titleBlock}>
          <Text style={s.docTitle}>Budget Breakdown</Text>
        </View>
        <View style={s.rule} />

        {/* ── OC subtitle ── */}
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, fontFamily: FONT, fontWeight: 700, color: brand }}>
            {oc.name}{oc.plan_number ? ` , ${oc.plan_number}` : ""}
          </Text>
          <Text style={{ fontSize: 9, color: c.foreground, marginTop: 4, letterSpacing: 0.3 }}>
            {oc.address}
          </Text>
        </View>

        {/* ── Expenditure sections , one per fund when multi-fund. ── */}
        {sortedFunds.map((fundKey, idx) => {
          const bucket = grouped.get(fundKey)!;
          const sectionTitle = isMultiFund
            ? (FUND_SECTION_LABEL[fundKey] ?? "Expenditure")
            : "Expenditure";
          const totalCopy = isMultiFund
            ? `Total ${FUND_SECTION_LABEL[fundKey] ?? "Fund"} Expenditure`
            : `Total ${fundLabel} Expenditure`;
          return (
            <View key={fundKey} wrap={false}>
              {idx > 0 && <View style={s.fundSeparator} />}
              <View style={s.sectionRow}>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>{sectionTitle}</Text>
                  <Text style={s.columnHead}>Amount</Text>
                </View>
              </View>
              <View style={s.sectionUnderline} />

              {bucket.items.map((it, i) => (
                <View key={i} style={s.item}>
                  <Text style={s.itemName}>
                    {it.code ? `${it.code}  ·  ` : ""}{it.description || it.name}
                  </Text>
                  <Text style={s.itemAmount}>{fmt(it.amount)}</Text>
                </View>
              ))}

              <View style={s.totalRule} />
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{totalCopy}</Text>
                <Text style={s.totalValue}>{fmt(bucket.total)}</Text>
              </View>
            </View>
          );
        })}

        {/* Grand total only when there's more than one fund , single-fund
            already shows its own total above and a second "Grand total"
            would just duplicate it. */}
        {isMultiFund && (
          <>
            <View style={s.grandTotalRule} />
            <View style={s.grandTotalRow}>
              <Text style={s.grandTotalLabel}>Total Budget</Text>
              <Text style={s.grandTotalValue}>{fmt(totalAmount)}</Text>
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

          const lotColW = showPerPeriod ? "40%" : "55%";
          const liabColW = showPerPeriod ? "15%" : "20%";
          const numColW = showPerPeriod ? "22.5%" : "25%";

          return (
            <View style={{ marginTop: 8 }}>
              <View style={s.lotsSectionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lotsSectionTitle}>Lot contributions</Text>
                  <Text style={s.lotsSubtitle}>
                    Each lot&apos;s share of the annual budget, calculated in proportion to its liability.
                  </Text>
                </View>
              </View>

              <View style={s.lotsTableHead}>
                <Text style={[s.lotsTh, { width: lotColW }]}>Lot</Text>
                <Text style={[s.lotsThRight, { width: liabColW }]}>Liability</Text>
                <Text style={[s.lotsThRight, { width: numColW }]}>Annual share</Text>
                {showPerPeriod ? (
                  <Text style={[s.lotsThRight, { width: numColW }]}>{periodLabel}</Text>
                ) : null}
              </View>

              {rows.map((r, i) => (
                <View key={i} style={i % 2 === 0 ? s.lotsRowStriped : s.lotsRow}>
                  <Text style={[s.lotsCell, { width: lotColW }]}>
                    {fmtLot(r.lot.lot_number, r.lot.unit_number)}
                  </Text>
                  <Text style={[s.lotsCellRight, { width: liabColW }]}>
                    {liabSafe(r.lot)}
                  </Text>
                  <Text style={[s.lotsCellRight, { width: numColW }]}>{fmt(r.annual)}</Text>
                  {showPerPeriod ? (
                    <Text style={[s.lotsCellRight, { width: numColW }]}>{fmt(r.perPeriod)}</Text>
                  ) : null}
                </View>
              ))}

              <View style={s.lotsTotalRow}>
                <Text style={[s.lotsTotalLabel, { width: lotColW }]}>Total</Text>
                <Text style={[s.lotsTotalValue, { width: liabColW }]}>{totalLiability}</Text>
                <Text style={[s.lotsTotalValue, { width: numColW }]}>
                  {fmt(rows.reduce((s, r) => s + r.annual, 0))}
                </Text>
                {showPerPeriod ? (
                  <Text style={[s.lotsTotalValue, { width: numColW }]}>
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
