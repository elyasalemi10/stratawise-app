import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { FinalNoticeProps } from "../types";
import "../fonts";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  white: "#ffffff",
  destructive: "#b91c1c",
};
const FONT = "NunitoSans";

function fmt(n: number): string {
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00`) : d;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export function FinalNotice({
  managementCompany,
  oc,
  documentTitle,
  referenceNumber,
  date,
  lotOwner,
  levyReference,
  levyDueDate,
  amountOutstanding,
  interestAccrued,
  dailyInterest,
  interestRateMonthly,
  brandColors,
}: FinalNoticeProps) {
  const brand1 = brandColors?.primary ?? "#0E314C";
  const total = Math.round((amountOutstanding + interestAccrued) * 100) / 100;

  const s = StyleSheet.create({
    page: { fontFamily: FONT, fontSize: 10, color: c.foreground, paddingTop: 28, paddingBottom: 24, paddingHorizontal: 28 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
    logo: { maxHeight: 60, maxWidth: 150, objectFit: "contain" as const },
    titleBlock: { alignItems: "flex-end" as const, maxWidth: 280 },
    title: { fontSize: 20, fontWeight: 700, color: c.destructive, textAlign: "right" as const },
    subtitle: { fontSize: 9, color: c.muted, marginTop: 2, textAlign: "right" as const },
    statBand: { backgroundColor: brand1, marginHorizontal: -28, paddingVertical: 6, paddingHorizontal: 28, marginBottom: 16 },
    statBandText: { fontSize: 9, color: c.white, letterSpacing: 0.5 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16, gap: 20 },
    infoLine: { flexDirection: "row", marginBottom: 3 },
    infoLabel: { fontSize: 9, color: c.muted, width: 70 },
    infoValue: { fontSize: 10, color: c.foreground, flex: 1 },
    ownerBox: { width: 210, backgroundColor: c.lightBg, borderWidth: 1, borderColor: c.border, padding: 10, borderRadius: 2 },
    ownerName: { fontSize: 11, fontWeight: 600, color: c.foreground, marginBottom: 2 },
    ownerDetail: { fontSize: 10, color: c.foreground, lineHeight: 1.4 },
    para: { fontSize: 10, color: c.foreground, lineHeight: 1.5, marginBottom: 10 },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: c.border },
    rowLabel: { fontSize: 10, color: c.foreground },
    rowVal: { fontSize: 10, color: c.foreground, fontWeight: 600 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1.5, borderTopColor: c.foreground, marginTop: 2 },
    totalLabel: { fontSize: 11, fontWeight: 700 },
    totalVal: { fontSize: 11, fontWeight: 700 },
    warn: { marginTop: 14, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 2, padding: 12 },
    warnText: { fontSize: 10, color: c.destructive, lineHeight: 1.5 },
    footer: { marginTop: 18, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
    footerText: { fontSize: 9, color: c.muted, lineHeight: 1.5 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.topRow}>
          <View style={{ maxWidth: 150 }}>
            {managementCompany.logo_url ? <Image src={managementCompany.logo_url} style={s.logo} /> : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>{documentTitle || "Final Fee Notice"}</Text>
            <Text style={s.subtitle}>{referenceNumber}</Text>
          </View>
        </View>

        <View style={s.statBand}>
          <Text style={s.statBandText}>Issued under the Owners Corporations Act 2006 (Vic)</Text>
        </View>

        <View style={s.infoRow}>
          <View style={{ flex: 1 }}>
            <View style={s.infoLine}><Text style={s.infoLabel}>Issued for</Text><Text style={s.infoValue}>{oc.name} {oc.plan_number}</Text></View>
            <View style={s.infoLine}><Text style={s.infoLabel}>Property</Text><Text style={s.infoValue}>{oc.address}</Text></View>
            {oc.abn ? <View style={s.infoLine}><Text style={s.infoLabel}>ABN</Text><Text style={s.infoValue}>{oc.abn}</Text></View> : null}
            <View style={s.infoLine}><Text style={s.infoLabel}>Date</Text><Text style={s.infoValue}>{fmtDate(date)}</Text></View>
          </View>
          <View style={s.ownerBox}>
            <Text style={s.ownerName}>{lotOwner.name}</Text>
            <Text style={s.ownerDetail}>{lotOwner.address}</Text>
            <Text style={s.ownerDetail}>Lot {lotOwner.lot_number}</Text>
          </View>
        </View>

        <Text style={s.para}>
          This is a final fee notice under the Owners Corporations Act 2006 (Vic). Our records show the
          following Owners Corporation fee remains unpaid.
        </Text>

        <View style={s.row}><Text style={s.rowLabel}>Levy reference</Text><Text style={s.rowVal}>{levyReference}</Text></View>
        <View style={s.row}><Text style={s.rowLabel}>Original due date</Text><Text style={s.rowVal}>{fmtDate(levyDueDate)}</Text></View>
        <View style={s.row}><Text style={s.rowLabel}>Fees outstanding</Text><Text style={s.rowVal}>{fmt(amountOutstanding)}</Text></View>
        <View style={s.row}><Text style={s.rowLabel}>Interest accrued (at {interestRateMonthly}% per month)</Text><Text style={s.rowVal}>{fmt(interestAccrued)}</Text></View>
        <View style={s.row}><Text style={s.rowLabel}>Interest accruing daily</Text><Text style={s.rowVal}>{fmt(dailyInterest)} per day</Text></View>
        <View style={s.totalRow}><Text style={s.totalLabel}>Total payable now</Text><Text style={s.totalVal}>{fmt(total)}</Text></View>

        <View style={s.warn}>
          <Text style={s.warnText}>
            If the total payable is not received within 28 days of the date of this notice, the Owners
            Corporation may apply to the Victorian Civil and Administrative Tribunal (VCAT) to recover the
            outstanding fees, interest and reasonable costs of recovery, without further notice to you.
          </Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>
            Issued by {managementCompany.name} on behalf of {oc.name}.
            {managementCompany.phone ? ` Phone ${managementCompany.phone}.` : ""}
            {managementCompany.email ? ` Email ${managementCompany.email}.` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
