import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import "../fonts";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  stripe: "#f5f7fa",
  white: "#ffffff",
  green: "#00bd7d",
  red: "#ef4444",
  blue: "#2b7fff",
};

const FONT = "NunitoSans";

const s = StyleSheet.create({
  page: {
    fontFamily: FONT,
    fontSize: 9,
    color: c.foreground,
    paddingTop: 28,
    paddingBottom: 50,
    paddingHorizontal: 28,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  logo: { maxHeight: 60, maxWidth: 150, objectFit: "contain" as const },
  headerRight: { alignItems: "flex-end" as const, maxWidth: 280 },
  title: { fontSize: 16, fontWeight: 700, color: c.foreground },
  subtitle: { fontSize: 8, color: c.muted, marginTop: 2, textAlign: "right" as const },
  // Info section
  infoSection: { flexDirection: "row", marginBottom: 14, gap: 20 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7, color: c.muted, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 9, color: c.foreground, marginBottom: 6 },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: c.blue,
    paddingVertical: 6,
    marginHorizontal: -28,
    paddingHorizontal: 36,
  },
  th: { fontSize: 7, fontWeight: 700, color: c.white, textTransform: "uppercase" as const, letterSpacing: 0.3 },
  row: { flexDirection: "row", paddingVertical: 5, marginHorizontal: -28, paddingHorizontal: 36 },
  rowStriped: { flexDirection: "row", paddingVertical: 5, marginHorizontal: -28, paddingHorizontal: 36, backgroundColor: c.stripe },
  td: { fontSize: 8, color: c.foreground },
  tdRight: { fontSize: 8, color: c.foreground, textAlign: "right" as const },
  tdMuted: { fontSize: 8, color: c.muted },
  tdGreen: { fontSize: 8, color: c.green, fontWeight: 600, textAlign: "right" as const },
  tdRed: { fontSize: 8, color: c.red, fontWeight: 600 },
  // Badge
  badge: { fontSize: 7, fontWeight: 600, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  badgeGreen: { backgroundColor: "#dcfce7", color: "#166534" },
  badgeRed: { backgroundColor: "#fee2e2", color: "#991b1b" },
  badgeBlue: { backgroundColor: "#dbeafe", color: "#1e40af" },
  badgeGrey: { backgroundColor: "#f3f4f6", color: "#374151" },
  badgeAmber: { backgroundColor: "#fef3c7", color: "#92400e" },
  // Footer
  footer: { position: "absolute" as const, bottom: 20, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: c.muted },
  // Summary
  summarySection: { marginTop: 10, borderTopWidth: 1.5, borderTopColor: c.foreground, paddingTop: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 8 },
  summaryLabel: { fontSize: 9, color: c.muted },
  summaryValue: { fontSize: 10, fontWeight: 700, color: c.foreground },
});

function fmt(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function fmtDate(date: string): string {
  if (!date) return "";
  const d = date.includes("T") ? new Date(date) : new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  const style = status === "paid" ? s.badgeGreen
    : status === "overdue" ? s.badgeRed
    : status === "issued" ? s.badgeBlue
    : status === "active" ? s.badgeGreen
    : status === "expired" ? s.badgeRed
    : status === "expiring soon" ? s.badgeAmber
    : status === "partially paid" ? s.badgeAmber
    : s.badgeGrey;
  return <Text style={[s.badge, style]}>{capitalize(status)}</Text>;
}

function ReportHeader({ title, logoUrl, info }: { title: string; logoUrl?: string | null; info: { label: string; value: string }[] }) {
  return (
    <View fixed>
      <View style={s.header}>
        <View>
          {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
        </View>
        <View style={s.headerRight}>
          <Text style={s.title}>{title}</Text>
          {[{ label: "Generated", value: fmtDate(new Date().toISOString()) }, ...info].map((item, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: i === 0 ? 4 : 1, minWidth: 200 }}>
              <Text style={[s.subtitle, { textAlign: "left" as const }]}>{item.label}</Text>
              <Text style={[s.subtitle, { fontWeight: 600 }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function ReportFooter({ label }: { label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{label}</Text>
      <Text style={s.footerText}>Confidential</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

// ─── Levy History Report ───────────────────────────────────

export interface LevyHistoryData {
  lot_number: number; owner_name: string | null; reference_number: string;
  period_start: string; period_end: string; amount: number; amount_paid: number;
  status: string; due_date: string;
}

export function LevyHistoryReport({ data, title, subtitle, address, logoUrl, lotOwnerName }: { data: LevyHistoryData[]; title: string; subtitle: string; address?: string; logoUrl?: string | null; lotOwnerName?: string }) {
  const total = data.reduce((sum, l) => sum + l.amount, 0);
  const totalPaid = data.reduce((sum, l) => sum + l.amount_paid, 0);
  const info = [
    { label: "Subdivision", value: subtitle },
    ...(address ? [{ label: "Address", value: address }] : []),
    ...(lotOwnerName ? [{ label: "Lot owner", value: lotOwnerName }] : []),
  ];

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <ReportHeader title={title} logoUrl={logoUrl} info={info} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "6%" }]}>Lot</Text>
          <Text style={[s.th, { width: "15%" }]}>Reference</Text>
          <Text style={[s.th, { width: "22%" }]}>Period</Text>
          <Text style={[s.th, { width: "12%" }]}>Due date</Text>
          <Text style={[s.th, { width: "13%" }]}>Status</Text>
          <Text style={[s.th, { width: "16%", textAlign: "right" as const }]}>Amount</Text>
          <Text style={[s.th, { width: "16%", textAlign: "right" as const }]}>Paid</Text>
        </View>
        {data.map((l, i) => {
          const paidColor = l.amount_paid <= 0 ? c.red : l.amount_paid >= l.amount ? c.green : "#f59e0b";
          return (
            <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row} wrap={false}>
              <Text style={[s.td, { width: "6%" }]}>{l.lot_number}</Text>
              <Text style={[s.td, { width: "15%" }]}>{l.reference_number}</Text>
              <Text style={[s.tdMuted, { width: "22%" }]}>{fmtDate(l.period_start)} — {fmtDate(l.period_end)}</Text>
              <Text style={[s.td, { width: "12%" }]}>{fmtDate(l.due_date)}</Text>
              <View style={{ width: "13%", flexDirection: "row" }}><StatusBadge status={l.status === "partially_paid" ? "partially paid" : l.status} /></View>
              <Text style={[s.tdRight, { width: "16%" }]}>{fmt(l.amount)}</Text>
              <Text style={{ fontSize: 8, fontWeight: 600, textAlign: "right" as const, width: "16%", color: paidColor }}>{fmt(l.amount_paid)}</Text>
            </View>
          );
        })}
        <View style={s.summarySection}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total levied</Text>
            <Text style={s.summaryValue}>{fmt(total)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total paid</Text>
            <Text style={[s.summaryValue, { color: c.green }]}>{fmt(totalPaid)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Outstanding balance</Text>
            <Text style={[s.summaryValue, { color: total - totalPaid > 0 ? c.red : c.green }]}>{fmt(total - totalPaid)}</Text>
          </View>
        </View>
        <ReportFooter label="Levy History Report" />
      </Page>
    </Document>
  );
}

// ─── Insurance Status Report ───────────────────────────────

export interface InsuranceStatusData {
  policy_type: string; provider: string; policy_number: string | null;
  start_date: string; end_date: string; sum_insured: number | null;
  premium: number | null; is_expired: boolean; is_expiring_soon: boolean;
}

const POLICY_NAMES: Record<string, string> = {
  building: "Building", public_liability: "Public Liability", contents: "Contents",
  workers_comp: "Workers Comp", office_bearers: "Office Bearers", fidelity: "Fidelity", other: "Other",
};

export function InsuranceStatusReport({ data, title, subtitle, address, logoUrl }: { data: InsuranceStatusData[]; title: string; subtitle: string; address?: string; logoUrl?: string | null }) {
  const activeCount = data.filter((p) => !p.is_expired).length;
  const totalPremium = data.filter((p) => !p.is_expired).reduce((sum, p) => sum + (p.premium ?? 0), 0);
  const totalInsured = data.filter((p) => !p.is_expired).reduce((sum, p) => sum + (p.sum_insured ?? 0), 0);
  const info = [
    { label: "Subdivision", value: subtitle },
    ...(address ? [{ label: "Address", value: address }] : []),
  ];

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <ReportHeader title={title} logoUrl={logoUrl} info={info} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "15%" }]}>Type</Text>
          <Text style={[s.th, { width: "15%" }]}>Provider</Text>
          <Text style={[s.th, { width: "24%" }]}>Coverage</Text>
          <Text style={[s.th, { width: "16%", textAlign: "right" as const }]}>Sum insured</Text>
          <Text style={[s.th, { width: "14%", textAlign: "right" as const }]}>Premium</Text>
          <Text style={[s.th, { width: "16%", textAlign: "right" as const }]}>Status</Text>
        </View>
        {data.map((p, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row} wrap={false}>
            <Text style={[s.td, { width: "15%" }]}>{POLICY_NAMES[p.policy_type] ?? p.policy_type}</Text>
            <Text style={[s.td, { width: "15%" }]}>{p.provider}</Text>
            <Text style={[s.tdMuted, { width: "24%" }]}>{fmtDate(p.start_date)} — {fmtDate(p.end_date)}</Text>
            <Text style={[s.tdRight, { width: "16%" }]}>{p.sum_insured ? fmt(p.sum_insured) : "—"}</Text>
            <Text style={[s.tdRight, { width: "14%" }]}>{p.premium ? fmt(p.premium) : "—"}</Text>
            <View style={{ width: "16%", flexDirection: "row", justifyContent: "flex-end" as const }}>
              <StatusBadge status={p.is_expired ? "expired" : p.is_expiring_soon ? "expiring soon" : "active"} />
            </View>
          </View>
        ))}
        <View style={s.summarySection}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Active policies</Text>
            <Text style={s.summaryValue}>{activeCount}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total sum insured</Text>
            <Text style={s.summaryValue}>{fmt(totalInsured)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total annual premium</Text>
            <Text style={s.summaryValue}>{fmt(totalPremium)}</Text>
          </View>
        </View>
        <ReportFooter label="Insurance Status Report" />
      </Page>
    </Document>
  );
}

// ─── Lot Owner Register Report ─────────────────────────────

export interface LotRegisterData {
  lot_number: number; unit_number: string | null; owner_name: string | null;
  owner_email: string | null; owner_phone: string | null;
  lot_entitlement: number; lot_liability: number; owner_occupied: boolean | null;
}

export function LotRegisterReport({ data, title, subtitle, address, logoUrl, showContact }: { data: LotRegisterData[]; title: string; subtitle: string; address?: string; logoUrl?: string | null; showContact: boolean }) {
  const totalUE = data.reduce((sum, lot) => sum + (lot.lot_entitlement || 0), 0);
  const totalLiability = data.reduce((sum, lot) => sum + (lot.lot_liability || 0), 0);
  const assignedCount = data.filter((lot) => lot.owner_name).length;
  const info = [
    { label: "Subdivision", value: subtitle },
    ...(address ? [{ label: "Address", value: address }] : []),
  ];

  return (
    <Document>
      <Page size="A4" style={s.page} orientation={showContact ? "landscape" : "portrait"} wrap>
        <ReportHeader title={title} logoUrl={logoUrl} info={info} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: showContact ? "8%" : "15%" }]}>Lot</Text>
          <Text style={[s.th, { width: showContact ? "14%" : "35%" }]}>Owner</Text>
          {showContact && <Text style={[s.th, { width: "20%" }]}>Email</Text>}
          {showContact && <Text style={[s.th, { width: "12%" }]}>Phone</Text>}
          <Text style={[s.th, { width: showContact ? "10%" : "25%", textAlign: "right" as const }]}>Entitlement</Text>
          <Text style={[s.th, { width: showContact ? "10%" : "25%", textAlign: "right" as const }]}>Liability</Text>
          {showContact && <Text style={[s.th, { width: "10%" }]}>Occupied</Text>}
        </View>
        {data.map((lot, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row} wrap={false}>
            <Text style={[s.td, { width: showContact ? "8%" : "15%" }]}>Lot {lot.lot_number}{lot.unit_number ? ` (${lot.unit_number})` : ""}</Text>
            <Text style={[s.td, { width: showContact ? "14%" : "35%" }]}>{lot.owner_name ?? "Unassigned"}</Text>
            {showContact && <Text style={[s.tdMuted, { width: "20%" }]}>{lot.owner_email ?? "—"}</Text>}
            {showContact && <Text style={[s.td, { width: "12%" }]}>{lot.owner_phone ?? "—"}</Text>}
            <Text style={[s.tdRight, { width: showContact ? "10%" : "25%" }]}>{lot.lot_entitlement || "—"}</Text>
            <Text style={[s.tdRight, { width: showContact ? "10%" : "25%" }]}>{lot.lot_liability || "—"}</Text>
            {showContact && <Text style={[s.td, { width: "10%" }]}>{lot.owner_occupied === null ? "—" : lot.owner_occupied ? "Yes" : "No"}</Text>}
          </View>
        ))}
        <View style={s.summarySection}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total lots</Text>
            <Text style={s.summaryValue}>{data.length}</Text>
          </View>
          {showContact && (
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Lots with owners</Text>
              <Text style={s.summaryValue}>{assignedCount} of {data.length}</Text>
            </View>
          )}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total units of entitlement</Text>
            <Text style={s.summaryValue}>{totalUE}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total liability</Text>
            <Text style={s.summaryValue}>{totalLiability}</Text>
          </View>
        </View>
        <ReportFooter label="Lot Owner Register" />
      </Page>
    </Document>
  );
}

// ─── Communication Log Report ──────────────────────────────

export interface CommLogData {
  type: string; description: string; detail: string; date: string; channel: string;
}

export function CommLogReport({ data, title, subtitle, address, logoUrl }: { data: CommLogData[]; title: string; subtitle: string; address?: string; logoUrl?: string | null }) {
  const info = [
    { label: "Subdivision", value: subtitle },
    ...(address ? [{ label: "Address", value: address }] : []),
    { label: "Total entries", value: String(data.length) },
  ];
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <ReportHeader title={title} logoUrl={logoUrl} info={info} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "14%" }]}>Date</Text>
          <Text style={[s.th, { width: "12%" }]}>Type</Text>
          <Text style={[s.th, { width: "32%" }]}>Description</Text>
          <Text style={[s.th, { width: "30%" }]}>Detail</Text>
          <Text style={[s.th, { width: "12%" }]}>Channel</Text>
        </View>
        {data.map((entry, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row} wrap={false}>
            <Text style={[s.tdMuted, { width: "14%" }]}>{fmtDate(entry.date)}</Text>
            <Text style={[s.td, { width: "12%" }]}>{capitalize(entry.type)}</Text>
            <Text style={[s.td, { width: "32%" }]}>{entry.description}</Text>
            <Text style={[s.tdMuted, { width: "30%" }]}>{entry.detail}</Text>
            <Text style={[s.td, { width: "12%" }]}>{capitalize(entry.channel)}</Text>
          </View>
        ))}
        <ReportFooter label="Communication Log" />
      </Page>
    </Document>
  );
}

// ─── Audit Trail Report ────────────────────────────────────

export interface AuditTrailData {
  action: string; entity_type: string; date: string; user_name: string; after_state: unknown;
}

export function AuditTrailReport({ data, title, subtitle, address, logoUrl }: { data: AuditTrailData[]; title: string; subtitle: string; address?: string; logoUrl?: string | null }) {
  const info = [
    { label: "Subdivision", value: subtitle },
    ...(address ? [{ label: "Address", value: address }] : []),
    { label: "Total entries", value: String(data.length) },
  ];
  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <ReportHeader title={title} logoUrl={logoUrl} info={info} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "14%" }]}>Date</Text>
          <Text style={[s.th, { width: "18%" }]}>User</Text>
          <Text style={[s.th, { width: "12%" }]}>Action</Text>
          <Text style={[s.th, { width: "14%" }]}>Entity</Text>
          <Text style={[s.th, { width: "42%" }]}>Changes</Text>
        </View>
        {data.map((entry, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row} wrap={false}>
            <Text style={[s.tdMuted, { width: "14%" }]}>{fmtDate(entry.date)}</Text>
            <Text style={[s.td, { width: "18%" }]}>{entry.user_name}</Text>
            <Text style={[s.td, { width: "12%" }]}>{capitalize(entry.action)}</Text>
            <Text style={[s.td, { width: "14%" }]}>{capitalize(entry.entity_type)}</Text>
            <Text style={[s.tdMuted, { width: "42%" }]}>{entry.after_state ? JSON.stringify(entry.after_state).slice(0, 100) : "—"}</Text>
          </View>
        ))}
        <ReportFooter label="Audit Trail" />
      </Page>
    </Document>
  );
}
