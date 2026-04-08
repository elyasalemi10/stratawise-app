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
    paddingBottom: 40,
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
  logo: { maxHeight: 40, maxWidth: 120, objectFit: "contain" as const },
  headerRight: { alignItems: "flex-end" as const },
  title: { fontSize: 16, fontWeight: 600, color: c.foreground },
  subtitle: { fontSize: 9, color: c.muted, marginTop: 2 },
  // Table
  tableHeader: {
    flexDirection: "row",
    backgroundColor: c.blue,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: { fontSize: 8, fontWeight: 700, color: c.white },
  row: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: c.border },
  rowStriped: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: c.border, backgroundColor: c.stripe },
  td: { fontSize: 8, color: c.foreground },
  tdRight: { fontSize: 8, color: c.foreground, textAlign: "right" as const },
  tdMuted: { fontSize: 8, color: c.muted },
  tdGreen: { fontSize: 8, color: c.green, textAlign: "right" as const },
  tdRed: { fontSize: 8, color: c.red },
  // Badge
  badge: { fontSize: 7, fontWeight: 600, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  badgeGreen: { backgroundColor: "#dcfce7", color: "#166534" },
  badgeRed: { backgroundColor: "#fee2e2", color: "#991b1b" },
  badgeBlue: { backgroundColor: "#dbeafe", color: "#1e40af" },
  badgeGrey: { backgroundColor: "#f3f4f6", color: "#374151" },
  badgeAmber: { backgroundColor: "#fef3c7", color: "#92400e" },
  // Footer
  footer: { position: "absolute" as const, bottom: 20, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: c.muted },
  // Summary
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 8 },
  summaryLabel: { fontSize: 9, color: c.muted },
  summaryValue: { fontSize: 9, fontWeight: 600, color: c.foreground },
});

function fmt(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function fmtDate(date: string): string {
  if (!date) return "";
  const d = date.includes("T") ? new Date(date) : new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const style = status === "paid" ? s.badgeGreen
    : status === "overdue" ? s.badgeRed
    : status === "issued" ? s.badgeBlue
    : status === "draft" ? s.badgeGrey
    : status === "active" ? s.badgeGreen
    : status === "expired" ? s.badgeRed
    : status === "expiring_soon" ? s.badgeAmber
    : s.badgeGrey;
  return <Text style={[s.badge, style]}>{status}</Text>;
}

// ─── Report Header (shared) ───────────────────────────────

function ReportHeader({ title, subtitle, logoUrl, generatedDate }: { title: string; subtitle: string; logoUrl?: string | null; generatedDate: string }) {
  return (
    <View style={s.header}>
      <View>
        {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
        <Text style={[s.subtitle, { marginTop: logoUrl ? 4 : 0 }]}>{subtitle}</Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.subtitle}>Generated {generatedDate}</Text>
      </View>
    </View>
  );
}

function ReportFooter({ pageLabel }: { pageLabel: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{pageLabel}</Text>
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

export function LevyHistoryReport({ data, title, subtitle, logoUrl }: { data: LevyHistoryData[]; title: string; subtitle: string; logoUrl?: string | null }) {
  const total = data.reduce((sum, l) => sum + l.amount, 0);
  const totalPaid = data.reduce((sum, l) => sum + l.amount_paid, 0);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ReportHeader title={title} subtitle={subtitle} logoUrl={logoUrl} generatedDate={fmtDate(new Date().toISOString())} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "10%" }]}>Lot</Text>
          <Text style={[s.th, { width: "15%" }]}>Reference</Text>
          <Text style={[s.th, { width: "25%" }]}>Period</Text>
          <Text style={[s.th, { width: "12%" }]}>Due</Text>
          <Text style={[s.th, { width: "13%", textAlign: "right" as const }]}>Amount</Text>
          <Text style={[s.th, { width: "13%", textAlign: "right" as const }]}>Paid</Text>
          <Text style={[s.th, { width: "12%" }]}>Status</Text>
        </View>
        {data.map((l, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row}>
            <Text style={[s.td, { width: "10%" }]}>Lot {l.lot_number}</Text>
            <Text style={[s.td, { width: "15%" }]}>{l.reference_number}</Text>
            <Text style={[s.tdMuted, { width: "25%" }]}>{fmtDate(l.period_start)} — {fmtDate(l.period_end)}</Text>
            <Text style={[s.td, { width: "12%" }]}>{fmtDate(l.due_date)}</Text>
            <Text style={[s.tdRight, { width: "13%" }]}>{fmt(l.amount)}</Text>
            <Text style={[s.tdGreen, { width: "13%" }]}>{fmt(l.amount_paid)}</Text>
            <View style={{ width: "12%" }}><StatusBadge status={l.status} /></View>
          </View>
        ))}
        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: c.foreground, paddingTop: 6 }}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total levied</Text>
            <Text style={s.summaryValue}>{fmt(total)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total paid</Text>
            <Text style={[s.summaryValue, { color: c.green }]}>{fmt(totalPaid)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Outstanding</Text>
            <Text style={[s.summaryValue, { color: total - totalPaid > 0 ? c.red : c.green }]}>{fmt(total - totalPaid)}</Text>
          </View>
        </View>
        <ReportFooter pageLabel="Levy History Report" />
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

export function InsuranceStatusReport({ data, title, subtitle, logoUrl }: { data: InsuranceStatusData[]; title: string; subtitle: string; logoUrl?: string | null }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ReportHeader title={title} subtitle={subtitle} logoUrl={logoUrl} generatedDate={fmtDate(new Date().toISOString())} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "15%" }]}>Type</Text>
          <Text style={[s.th, { width: "18%" }]}>Provider</Text>
          <Text style={[s.th, { width: "12%" }]}>Policy #</Text>
          <Text style={[s.th, { width: "22%" }]}>Coverage</Text>
          <Text style={[s.th, { width: "13%", textAlign: "right" as const }]}>Sum insured</Text>
          <Text style={[s.th, { width: "10%", textAlign: "right" as const }]}>Premium</Text>
          <Text style={[s.th, { width: "10%" }]}>Status</Text>
        </View>
        {data.map((p, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row}>
            <Text style={[s.td, { width: "15%" }]}>{POLICY_NAMES[p.policy_type] ?? p.policy_type}</Text>
            <Text style={[s.td, { width: "18%" }]}>{p.provider}</Text>
            <Text style={[s.td, { width: "12%" }]}>{p.policy_number ?? "—"}</Text>
            <Text style={[s.tdMuted, { width: "22%" }]}>{fmtDate(p.start_date)} — {fmtDate(p.end_date)}</Text>
            <Text style={[s.tdRight, { width: "13%" }]}>{p.sum_insured ? fmt(p.sum_insured) : "—"}</Text>
            <Text style={[s.tdRight, { width: "10%" }]}>{p.premium ? fmt(p.premium) : "—"}</Text>
            <View style={{ width: "10%" }}>
              <StatusBadge status={p.is_expired ? "expired" : p.is_expiring_soon ? "expiring_soon" : "active"} />
            </View>
          </View>
        ))}
        <ReportFooter pageLabel="Insurance Status Report" />
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

export function LotRegisterReport({ data, title, subtitle, logoUrl, showContact }: { data: LotRegisterData[]; title: string; subtitle: string; logoUrl?: string | null; showContact: boolean }) {
  return (
    <Document>
      <Page size="A4" style={s.page} orientation={showContact ? "landscape" : "portrait"}>
        <ReportHeader title={title} subtitle={subtitle} logoUrl={logoUrl} generatedDate={fmtDate(new Date().toISOString())} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: showContact ? "10%" : "15%" }]}>Lot</Text>
          <Text style={[s.th, { width: showContact ? "15%" : "30%" }]}>Owner</Text>
          {showContact && <Text style={[s.th, { width: "20%" }]}>Email</Text>}
          {showContact && <Text style={[s.th, { width: "12%" }]}>Phone</Text>}
          <Text style={[s.th, { width: showContact ? "10%" : "15%", textAlign: "right" as const }]}>UE</Text>
          <Text style={[s.th, { width: showContact ? "10%" : "15%", textAlign: "right" as const }]}>Liability</Text>
          {showContact && <Text style={[s.th, { width: "8%" }]}>Occupied</Text>}
        </View>
        {data.map((lot, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row}>
            <Text style={[s.td, { width: showContact ? "10%" : "15%" }]}>Lot {lot.lot_number}{lot.unit_number ? ` (${lot.unit_number})` : ""}</Text>
            <Text style={[s.td, { width: showContact ? "15%" : "30%" }]}>{lot.owner_name ?? "Unassigned"}</Text>
            {showContact && <Text style={[s.tdMuted, { width: "20%" }]}>{lot.owner_email ?? "—"}</Text>}
            {showContact && <Text style={[s.td, { width: "12%" }]}>{lot.owner_phone ?? "—"}</Text>}
            <Text style={[s.tdRight, { width: showContact ? "10%" : "15%" }]}>{lot.lot_entitlement || "—"}</Text>
            <Text style={[s.tdRight, { width: showContact ? "10%" : "15%" }]}>{lot.lot_liability || "—"}</Text>
            {showContact && <Text style={[s.td, { width: "8%" }]}>{lot.owner_occupied === null ? "—" : lot.owner_occupied ? "Yes" : "No"}</Text>}
          </View>
        ))}
        <ReportFooter pageLabel="Lot Owner Register" />
      </Page>
    </Document>
  );
}

// ─── Communication Log Report ──────────────────────────────

export interface CommLogData {
  type: string; description: string; detail: string; date: string; channel: string;
}

export function CommLogReport({ data, title, subtitle, logoUrl }: { data: CommLogData[]; title: string; subtitle: string; logoUrl?: string | null }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ReportHeader title={title} subtitle={subtitle} logoUrl={logoUrl} generatedDate={fmtDate(new Date().toISOString())} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "15%" }]}>Date</Text>
          <Text style={[s.th, { width: "12%" }]}>Type</Text>
          <Text style={[s.th, { width: "30%" }]}>Description</Text>
          <Text style={[s.th, { width: "30%" }]}>Detail</Text>
          <Text style={[s.th, { width: "13%" }]}>Channel</Text>
        </View>
        {data.map((entry, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row}>
            <Text style={[s.tdMuted, { width: "15%" }]}>{fmtDate(entry.date)}</Text>
            <Text style={[s.td, { width: "12%" }]}>{entry.type}</Text>
            <Text style={[s.td, { width: "30%" }]}>{entry.description}</Text>
            <Text style={[s.tdMuted, { width: "30%" }]}>{entry.detail}</Text>
            <Text style={[s.td, { width: "13%" }]}>{entry.channel}</Text>
          </View>
        ))}
        <ReportFooter pageLabel="Communication Log" />
      </Page>
    </Document>
  );
}

// ─── Audit Trail Report ────────────────────────────────────

export interface AuditTrailData {
  action: string; entity_type: string; date: string; user_name: string; after_state: unknown;
}

export function AuditTrailReport({ data, title, subtitle, logoUrl }: { data: AuditTrailData[]; title: string; subtitle: string; logoUrl?: string | null }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ReportHeader title={title} subtitle={subtitle} logoUrl={logoUrl} generatedDate={fmtDate(new Date().toISOString())} />
        <View style={s.tableHeader}>
          <Text style={[s.th, { width: "15%" }]}>Date</Text>
          <Text style={[s.th, { width: "20%" }]}>User</Text>
          <Text style={[s.th, { width: "12%" }]}>Action</Text>
          <Text style={[s.th, { width: "15%" }]}>Entity</Text>
          <Text style={[s.th, { width: "38%" }]}>Changes</Text>
        </View>
        {data.map((entry, i) => (
          <View key={i} style={i % 2 === 0 ? s.rowStriped : s.row}>
            <Text style={[s.tdMuted, { width: "15%" }]}>{fmtDate(entry.date)}</Text>
            <Text style={[s.td, { width: "20%" }]}>{entry.user_name}</Text>
            <Text style={[s.td, { width: "12%" }]}>{entry.action}</Text>
            <Text style={[s.td, { width: "15%" }]}>{entry.entity_type}</Text>
            <Text style={[s.tdMuted, { width: "38%" }]}>{entry.after_state ? JSON.stringify(entry.after_state).slice(0, 80) : "—"}</Text>
          </View>
        ))}
        <ReportFooter pageLabel="Audit Trail" />
      </Page>
    </Document>
  );
}
