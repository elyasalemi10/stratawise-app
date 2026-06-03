import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { MeetingNoticeProps } from "../types";
import "../fonts"; // Register NunitoSans

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  white: "#ffffff",
};

const FONT = "NunitoSans";

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function MeetingNotice({
  managementCompany,
  oc,
  documentTitle,
  referenceNumber,
  date,
  meetingTypeLabel,
  meetingTitle,
  whenLabel,
  location,
  onlineLink,
  agenda,
  brandColors,
}: MeetingNoticeProps) {
  const brand1 = brandColors?.primary ?? "#0E314C";
  const brand2 = brandColors?.secondary ?? brand1;

  const s = StyleSheet.create({
    page: { fontFamily: FONT, fontSize: 10, color: c.foreground, paddingTop: 28, paddingBottom: 24, paddingHorizontal: 28 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
    logo: { maxHeight: 60, maxWidth: 150, objectFit: "contain" as const },
    titleBlock: { alignItems: "flex-end" as const, maxWidth: 280 },
    title: { fontSize: 22, fontWeight: 600, color: c.foreground, textAlign: "right" as const },
    subtitle: { fontSize: 9, color: c.muted, marginTop: 2, textAlign: "right" as const },
    typeBand: { backgroundColor: brand1, marginHorizontal: -28, paddingVertical: 8, paddingHorizontal: 28, marginBottom: 18 },
    typeBandText: { fontSize: 12, fontWeight: 700, color: c.white, letterSpacing: 0.5 },
    infoRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, marginBottom: 18, gap: 20 },
    infoLeft: { flex: 1 },
    infoLine: { flexDirection: "row", marginBottom: 4 },
    infoLabel: { fontSize: 9, color: c.muted, width: 70 },
    infoValue: { fontSize: 10, color: c.foreground, flex: 1 },
    infoValueBold: { fontSize: 10, fontWeight: 600, color: c.foreground, flex: 1 },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: c.foreground, marginBottom: 8 },
    detailCard: { backgroundColor: c.lightBg, borderWidth: 1, borderColor: c.border, borderRadius: 2, padding: 12, marginBottom: 18 },
    detailRow: { flexDirection: "row", marginBottom: 6 },
    detailLabel: { fontSize: 10, color: c.muted, width: 80 },
    detailValue: { fontSize: 11, color: c.foreground, flex: 1 },
    agendaItem: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: c.border, gap: 10 },
    agendaNum: { fontSize: 11, fontWeight: 700, color: brand2, width: 22 },
    agendaBody: { flex: 1 },
    agendaTitle: { fontSize: 11, fontWeight: 600, color: c.foreground },
    agendaMotion: { fontSize: 10, color: c.muted, marginTop: 2, lineHeight: 1.4 },
    footer: { marginTop: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border },
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
            <Text style={s.title}>{documentTitle || "Meeting Notice"}</Text>
            <Text style={s.subtitle}>{referenceNumber}</Text>
          </View>
        </View>

        <View style={s.typeBand}>
          <Text style={s.typeBandText}>{meetingTypeLabel}</Text>
        </View>

        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issued for</Text>
              <Text style={s.infoValueBold}>{oc.name} {oc.plan_number}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Address</Text>
              <Text style={s.infoValue}>{oc.address}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issued</Text>
              <Text style={s.infoValue}>{fmtDate(date)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>{meetingTitle}</Text>
        <View style={s.detailCard}>
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>When</Text>
            <Text style={s.detailValue}>{whenLabel}</Text>
          </View>
          {location ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Where</Text>
              <Text style={s.detailValue}>{location}</Text>
            </View>
          ) : null}
          {onlineLink ? (
            <View style={[s.detailRow, { marginBottom: 0 }]}>
              <Text style={s.detailLabel}>Online</Text>
              <Text style={s.detailValue}>{onlineLink}</Text>
            </View>
          ) : null}
        </View>

        {agenda.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Agenda</Text>
            <View>
              {agenda.map((item) => (
                <View key={item.position} style={s.agendaItem}>
                  <Text style={s.agendaNum}>{item.position}.</Text>
                  <View style={s.agendaBody}>
                    <Text style={s.agendaTitle}>{item.title}</Text>
                    {item.motion ? <Text style={s.agendaMotion}>{item.motion}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

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
