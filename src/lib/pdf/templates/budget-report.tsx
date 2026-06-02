import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { BudgetReportProps } from "../types";
import "../fonts";

// Budget Breakdown report. Visual structure: top row holds the management
// logo on the left and small company contact lines on the right, separated
// from the rest of the page by a thin grey divider. Below the divider the
// document title ("Budget breakdown") sits with the financial-year period
// in the secondary brand colour. The OC subtitle uses a quote-style
// rectangle (subtle background + left border in primary brand colour).
// Each fund (Operating / Maintenance Plan) renders as
// a contained levy-style table , brand-coloured header row, striped body
// rows, per-fund total. Multi-fund budgets get a grand total. The page
// closes with the lot contributions table (per-lot share of the annual
// budget calculated from liability) and any approval note. Footer prints
// the company name and page number only (no logo).

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  hairline: "#0f0f0f",
  white: "#ffffff",
  stripe: "#f5f7fa",
  blockquoteBg: "#f8f9fb",
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
  operating: "Admin Fund",
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
  fundLotLiabilities,
  billingCycle,
}: BudgetReportProps) {
  const brand = brandColors?.primary ?? "#1e7ec0"; // azure default
  const brand2 = brandColors?.secondary ?? "#CFA753"; // gold default

  // Group items by fund key. Custom funds get their own bucket keyed by
  // `custom:<fund_id>` so each fund renders its own section with the
  // fund's actual name (e.g. "Driveway Fund") rather than the generic
  // "Admin Fund" placeholder enum used for back-compat in the DB.
  const fundOrder = ["operating", "maintenance_plan"] as const;
  const fundLabelByKey = new Map<string, string>();
  fundLabelByKey.set("operating", "Admin Fund");
  fundLabelByKey.set("maintenance_plan", "Maintenance Plan Fund");
  const grouped = new Map<string, { items: typeof items; total: number }>();
  for (const it of items) {
    const key = it.fund_id ? `custom:${it.fund_id}` : (it.fund_type ?? "_single");
    if (it.fund_id && it.fund_name) fundLabelByKey.set(key, it.fund_name);
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

    // ── Top row , logo (left) + small company info (right) ──
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 24,
    },
    topRowLeft: { flexShrink: 0 },
    headerLogo: { maxHeight: 60, maxWidth: 180, objectFit: "contain" as const, marginLeft: -40 },
    topRowRight: { alignItems: "flex-end" as const, maxWidth: 280, paddingTop: 4 },
    companyName: {
      fontSize: 10,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      textAlign: "right" as const,
    },
    companyMeta: {
      fontSize: 8,
      color: c.muted,
      marginTop: 2,
      textAlign: "right" as const,
      lineHeight: 1.4,
    },

    // ── Divider between letterhead and content ──
    divider: { height: 1, backgroundColor: c.border, marginTop: 18, marginBottom: 18 },

    // ── Title block ──
    docTitle: {
      fontSize: 22,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
    },
    periodSubtitle: {
      fontSize: 10,
      color: brand2,
      marginTop: 4,
    },

    // ── OC quote-style rectangle ──
    ocQuote: {
      marginTop: 18,
      backgroundColor: c.blockquoteBg,
      borderLeftWidth: 3,
      borderLeftColor: brand,
      paddingLeft: 12,
      paddingRight: 12,
      paddingVertical: 10,
    },
    ocName: {
      fontSize: 11,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
    },
    ocAddress: {
      fontSize: 9,
      color: c.muted,
      marginTop: 4,
      lineHeight: 1.4,
    },

    // ── Fund section ──
    fundBlock: { marginTop: 22 },
    fundSeparator: { height: 1, backgroundColor: c.border, marginTop: 22 },
    fundTitle: {
      fontSize: 13,
      fontFamily: FONT,
      fontWeight: 700,
      color: c.foreground,
      marginBottom: 8,
    },

    // ── Items table (contained within page padding) ──
    itemsTableHeader: {
      flexDirection: "row",
      backgroundColor: brand,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderTopLeftRadius: 2,
      borderTopRightRadius: 2,
    },
    itemsHeaderCell: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.white },
    itemsRow: {
      flexDirection: "row",
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    itemsRowStriped: {
      flexDirection: "row",
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: c.stripe,
    },
    itemsCell: { fontSize: 9, color: c.foreground },
    itemsCellRight: { fontSize: 9, color: c.foreground, textAlign: "right" as const },

    // ── Fund total ──
    fundTotalRow: {
      flexDirection: "row",
      paddingTop: 8,
      paddingBottom: 2,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
      marginTop: 4,
    },
    fundTotalLabel: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground },
    fundTotalValue: { fontSize: 10, fontFamily: FONT, fontWeight: 700, color: c.foreground, textAlign: "right" as const },

    // ── Grand total (multi-fund only) ──
    grandTotalRule: { height: 2, backgroundColor: brand, marginTop: 28 },
    grandTotalRow: {
      flexDirection: "row",
      paddingTop: 10,
      paddingHorizontal: 12,
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
      paddingHorizontal: 12,
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
        {/* ── Top row , logo on the left, company info (small, right-aligned) on the right. ── */}
        <View style={s.topRow}>
          <View style={s.topRowLeft}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.headerLogo} />
            ) : null}
          </View>
          <View style={s.topRowRight}>
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
        </View>

        {/* ── Divider ── */}
        <View style={s.divider} />

        {/* ── Title + period (secondary brand colour) ── */}
        <View>
          <Text style={s.docTitle}>Budget breakdown</Text>
          <Text style={s.periodSubtitle}>{periodCopy}</Text>
        </View>

        {/* ── OC quote-style box ── */}
        <View style={s.ocQuote}>
          <Text style={s.ocName}>
            {oc.name}{oc.plan_number ? ` , ${oc.plan_number}` : ""}
          </Text>
          <Text style={s.ocAddress}>{oc.address}</Text>
        </View>

        {/* ── One section per fund , fund name as the section title, then
            a levy-style contained table, then the fund's total. ── */}
        {sortedFunds.map((fundKey, idx) => {
          const bucket = grouped.get(fundKey)!;
          const sectionTitle = fundLabelByKey.get(fundKey) ?? FUND_SECTION_LABEL[fundKey] ?? fundLabel ?? "Expenditure";
          const totalCopy = `Total ${sectionTitle}`;
          return (
            <View key={fundKey} style={s.fundBlock} wrap={false}>
              {idx > 0 && <View style={s.fundSeparator} />}
              <View style={idx > 0 ? { marginTop: 16 } : undefined}>
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

        {/* ── Lot contributions , one section per fund, each calculated in
            proportion to that fund's per-lot liability. Custom funds use
            their own fund_lot_entitlements (a fund may exclude some lots
            entirely); admin / maintenance funds use the OC's lot_liability. ── */}
        {lots && lots.length > 0 ? sortedFunds.map((fundKey) => {
          const bucket = grouped.get(fundKey)!;
          const fundTitle = fundLabelByKey.get(fundKey) ?? FUND_SECTION_LABEL[fundKey] ?? "Fund";
          const periods = BILLING_PERIODS_PER_YEAR[billingCycle ?? ""] ?? 1;
          const periodLabel = PERIOD_LABEL[billingCycle ?? ""] ?? "Per period";
          const showPerPeriod = periods > 1;

          // Resolve per-lot liability for this fund:
          //   - custom fund (custom:<id>): look up fund_lot_entitlements
          //   - admin / maintenance: use OC-wide lots[].liability
          let liabByLot: Map<number, number>;
          if (fundKey.startsWith("custom:") && fundLotLiabilities) {
            liabByLot = new Map(
              fundLotLiabilities
                .filter((e) => e.fund_key === fundKey)
                .map((e) => [e.lot_number, e.liability]),
            );
          } else {
            liabByLot = new Map(lots.map((l) => [l.lot_number, l.liability > 0 ? l.liability : 1]));
          }

          // Only render lots that belong to this fund (custom funds may
          // exclude lots; admin/maintenance always include every lot).
          const memberLots = lots.filter((l) => liabByLot.has(l.lot_number));
          if (memberLots.length === 0) return null;
          const totalLiability = memberLots.reduce((s, l) => s + (liabByLot.get(l.lot_number) ?? 0), 0);
          if (totalLiability <= 0) return null;

          const rows = memberLots.map((lot) => {
            const liab = liabByLot.get(lot.lot_number) ?? 0;
            const proportion = liab / totalLiability;
            const annual = Math.round(bucket.total * proportion * 100) / 100;
            const perPeriod = Math.round((annual / periods) * 100) / 100;
            return { lot, liab, annual, perPeriod };
          });

          const lotFlex = showPerPeriod ? 2.4 : 3;
          const liabFlex = 1;
          const numFlex = 1.4;

          return (
            <View key={`contrib-${fundKey}`} style={s.lotsBlock} wrap={false}>
              <Text style={s.lotsTitle}>{fundTitle} - Lot contributions</Text>
              <Text style={s.lotsSubtitle}>
                Each member lot&apos;s share of the {fundTitle} annual total, in proportion to its liability for this fund.
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
                  <Text style={[s.itemsCellRight, { flex: liabFlex }]}>{r.liab}</Text>
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
        }) : null}

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
