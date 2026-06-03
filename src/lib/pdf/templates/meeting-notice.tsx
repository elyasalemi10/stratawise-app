import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import type { MeetingNoticeProps } from "../types";
import "../fonts"; // Register NunitoSans

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#d8dce3",
  lightBg: "#f5f7fa",
  white: "#ffffff",
};

const FONT = "NunitoSans";

export function MeetingNotice(props: MeetingNoticeProps) {
  const {
    managementCompany, oc, referenceNumber, date, meetingType, meetingTypeLabel,
    meetingTitle, dateLabel, timeLabel, format, location, onlineLink, onlinePlatformLabel,
    ocLotCount, agenda, brandColors,
  } = props;
  const brand = brandColors?.primary ?? "#0E314C";

  const motions = agenda.filter((a) => a.motion && a.motion.trim().length > 0);
  const quorumLots = Math.max(1, Math.ceil(ocLotCount / 2));
  const noticeDateLabel = date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const isAgm = meetingType === "agm";
  const titleLine = isAgm ? "NOTICE OF ANNUAL GENERAL MEETING" : "NOTICE OF SPECIAL GENERAL MEETING";
  const formatLabel = format === "online"
    ? `Held electronically via ${onlinePlatformLabel || "an online meeting"}${onlineLink ? ` , ${onlineLink}` : ""}`
    : (location || "To be confirmed");

  const s = StyleSheet.create({
    page: { fontFamily: FONT, fontSize: 10, color: c.foreground, paddingTop: 30, paddingBottom: 36, paddingHorizontal: 34, lineHeight: 1.5 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
    logo: { maxHeight: 52, maxWidth: 150, objectFit: "contain" as const },
    companyBlock: { alignItems: "flex-end" as const },
    companyName: { fontSize: 11, fontWeight: 700, color: c.foreground, textAlign: "right" as const },
    companyMeta: { fontSize: 8.5, color: c.muted, textAlign: "right" as const, marginTop: 1 },
    title: { fontSize: 17, fontWeight: 700, color: brand, textAlign: "center" as const, marginTop: 6 },
    titleRule: { borderBottomWidth: 2, borderBottomColor: brand, width: 120, alignSelf: "center" as const, marginTop: 6, marginBottom: 4 },
    subtitle: { fontSize: 9.5, color: c.muted, textAlign: "center" as const, fontStyle: "italic" as const, marginBottom: 16 },
    sectionTitle: { fontSize: 12, fontWeight: 700, color: brand, marginTop: 14, marginBottom: 6 },
    para: { fontSize: 10, color: c.foreground, marginBottom: 8 },
    detailRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: c.border, paddingVertical: 5 },
    detailLabel: { fontSize: 10, fontWeight: 700, color: c.foreground, width: 150, paddingRight: 10 },
    detailValue: { fontSize: 10, color: c.foreground, flex: 1 },
    agendaItem: { flexDirection: "row", marginBottom: 4, gap: 6 },
    agendaNum: { fontSize: 10, fontWeight: 700, color: c.foreground, width: 18 },
    agendaText: { fontSize: 10, color: c.foreground, flex: 1 },
    motionBox: { borderLeftWidth: 3, borderLeftColor: brand, backgroundColor: c.lightBg, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
    motionTitle: { fontSize: 10.5, fontWeight: 700, color: c.foreground, marginBottom: 3 },
    motionText: { fontSize: 10, color: c.foreground, fontStyle: "italic" as const, marginBottom: 4 },
    motionMeta: { fontSize: 9, color: c.muted },
    bullet: { flexDirection: "row", gap: 6, marginBottom: 4 },
    bulletDot: { fontSize: 10, color: c.foreground },
    bulletText: { fontSize: 10, color: c.foreground, flex: 1 },
    sigLine: { borderBottomWidth: 1, borderBottomColor: c.foreground, width: 240, marginTop: 28, marginBottom: 4 },
    sigText: { fontSize: 10, color: c.foreground },
    // Proxy form
    formField: { borderBottomWidth: 0.7, borderBottomColor: c.foreground, marginTop: 18, paddingBottom: 2 },
    formFieldLabel: { fontSize: 9, color: c.muted },
    th: { flexDirection: "row", backgroundColor: brand, paddingVertical: 5, paddingHorizontal: 6 },
    thCell: { fontSize: 9, fontWeight: 700, color: c.white },
    tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: c.border },
    td: { fontSize: 9.5, color: c.foreground },
  });

  const Header = () => (
    <View style={s.headerRow}>
      {managementCompany.logo_url ? <Image src={managementCompany.logo_url} style={s.logo} /> : <View />}
      <View style={s.companyBlock}>
        <Text style={s.companyName}>{managementCompany.name}</Text>
        {managementCompany.abn ? <Text style={s.companyMeta}>ABN {managementCompany.abn}</Text> : null}
        {managementCompany.email ? <Text style={s.companyMeta}>{managementCompany.email}</Text> : null}
        {managementCompany.phone ? <Text style={s.companyMeta}>{managementCompany.phone}</Text> : null}
      </View>
    </View>
  );

  return (
    <Document>
      {/* ── Page 1: Notice ── */}
      <Page size="A4" style={s.page}>
        <Header />
        <Text style={s.title}>{titleLine}</Text>
        <View style={s.titleRule} />
        <Text style={s.subtitle}>Issued under the Owners Corporations Act 2006 (Vic)</Text>

        <Text style={s.para}>
          Notice is given to all lot owners of {oc.name}{oc.plan_number ? ` , ${oc.plan_number}` : ""} that {isAgm ? "the Annual General Meeting" : "a Special General Meeting"} of the Owners Corporation will be held as set out below. The purpose of the meeting is to address the business listed in the agenda{motions.length > 0 ? " and to consider the motion(s) set out in this notice" : ""}.
        </Text>

        <Text style={s.sectionTitle}>Meeting details</Text>
        <View>
          <View style={s.detailRow}><Text style={s.detailLabel}>Owners Corporation</Text><Text style={s.detailValue}>{oc.name}{oc.plan_number ? ` , ${oc.plan_number}` : ""}</Text></View>
          <View style={s.detailRow}><Text style={s.detailLabel}>Property</Text><Text style={s.detailValue}>{oc.address}</Text></View>
          {oc.abn ? <View style={s.detailRow}><Text style={s.detailLabel}>ABN</Text><Text style={s.detailValue}>{oc.abn}</Text></View> : null}
          <View style={s.detailRow}><Text style={s.detailLabel}>Meeting type</Text><Text style={s.detailValue}>{meetingTypeLabel}{meetingTitle && meetingTitle !== meetingTypeLabel ? ` , ${meetingTitle}` : ""}</Text></View>
          <View style={s.detailRow}><Text style={s.detailLabel}>Date</Text><Text style={s.detailValue}>{dateLabel}</Text></View>
          <View style={s.detailRow}><Text style={s.detailLabel}>Time</Text><Text style={s.detailValue}>{timeLabel}</Text></View>
          <View style={s.detailRow}><Text style={s.detailLabel}>Format</Text><Text style={s.detailValue}>{formatLabel}</Text></View>
          <View style={s.detailRow}><Text style={s.detailLabel}>Notice issued</Text><Text style={s.detailValue}>{noticeDateLabel}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Agenda</Text>
        {agenda.length > 0 ? agenda.map((a) => (
          <View key={a.position} style={s.agendaItem}><Text style={s.agendaNum}>{a.position}.</Text><Text style={s.agendaText}>{a.title}</Text></View>
        )) : (
          <View>
            <View style={s.agendaItem}><Text style={s.agendaNum}>1.</Text><Text style={s.agendaText}>Welcome and confirmation of quorum</Text></View>
            <View style={s.agendaItem}><Text style={s.agendaNum}>2.</Text><Text style={s.agendaText}>Apologies</Text></View>
            <View style={s.agendaItem}><Text style={s.agendaNum}>3.</Text><Text style={s.agendaText}>General business</Text></View>
            <View style={s.agendaItem}><Text style={s.agendaNum}>4.</Text><Text style={s.agendaText}>Close</Text></View>
          </View>
        )}

        {motions.length > 0 ? (
          <>
            <Text style={s.sectionTitle}>Motions for consideration</Text>
            {motions.map((m, i) => (
              <View key={m.position} style={s.motionBox}>
                <Text style={s.motionTitle}>Motion {i + 1} , {m.title}</Text>
                <Text style={s.motionText}>{m.motion}</Text>
                <Text style={s.motionMeta}>Vote required: ordinary resolution (simple majority), unless the Act requires otherwise.</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.sectionTitle}>Quorum and voting</Text>
        <View style={s.bullet}><Text style={s.bulletDot}>{"•"}</Text><Text style={s.bulletText}>A quorum requires lot owners entitled to vote on at least 50% of the total lots to be present in person or by proxy. For this Owners Corporation that means at least {quorumLots} of {ocLotCount} lots.</Text></View>
        <View style={s.bullet}><Text style={s.bulletDot}>{"•"}</Text><Text style={s.bulletText}>If a quorum is not present within 30 minutes of the scheduled start time, the meeting is adjourned. Owners present at the reconvened meeting form the quorum.</Text></View>
        <View style={s.bullet}><Text style={s.bulletDot}>{"•"}</Text><Text style={s.bulletText}>Each lot is entitled to one vote on each ordinary resolution. Voting may be in person, by proxy (using the attached form), or by any other means the chairperson permits.</Text></View>

        <Text style={s.sectionTitle}>Appointment of proxy</Text>
        <Text style={s.para}>
          If you are unable to attend, you may appoint another person to attend and vote on your behalf by completing the proxy appointment form attached to this notice. The completed form must be returned to {managementCompany.name}{managementCompany.email ? ` at ${managementCompany.email}` : ""} no later than 24 hours before the scheduled start of the meeting. Under the Owners Corporations Act 2006 (Vic), a manager and certain related parties are restricted from acting as proxy on matters in which they have an interest.
        </Text>

        <View style={s.sigLine} />
        <Text style={s.sigText}>{managementCompany.name}</Text>
        <Text style={s.sigText}>Manager, {oc.name}{oc.plan_number ? ` ${oc.plan_number}` : ""}</Text>
        {managementCompany.email || managementCompany.phone ? <Text style={s.sigText}>{[managementCompany.email, managementCompany.phone].filter(Boolean).join(" · ")}</Text> : null}
        <Text style={s.sigText}>Date: {noticeDateLabel}</Text>
      </Page>

      {/* ── Page 2: Proxy appointment form ── */}
      <Page size="A4" style={s.page}>
        <Header />
        <Text style={s.title}>PROXY APPOINTMENT FORM</Text>
        <View style={s.titleRule} />
        <Text style={s.subtitle}>{meetingTypeLabel} , {dateLabel} , {oc.name}{oc.plan_number ? ` ${oc.plan_number}` : ""}</Text>

        <Text style={s.para}>Owners Corporation: {oc.name}{oc.plan_number ? ` , ${oc.plan_number}` : ""} , {oc.address}</Text>

        <Text style={s.sectionTitle}>Part A , Appointment</Text>
        <Text style={s.para}>
          I/We, the undersigned lot owner(s), appoint the person named below to act as my/our proxy at the {meetingTypeLabel} of the Owners Corporation to be held on {dateLabel} at {timeLabel}, and at any adjournment of that meeting.
        </Text>
        {[
          "Full name of lot owner",
          "Lot number(s) and address",
          "Name of person appointed as proxy",
          "Signature of lot owner",
          "Date",
        ].map((label) => (
          <View key={label} style={s.formField}><Text style={s.formFieldLabel}>{label}</Text></View>
        ))}

        <Text style={s.sectionTitle}>Part B , Voting directions (optional)</Text>
        <Text style={s.para}>If you wish to direct your proxy how to vote, mark the relevant box for each motion. If no direction is given, the proxy may vote at their discretion.</Text>
        <View style={{ marginTop: 4 }}>
          <View style={s.th}>
            <Text style={[s.thCell, { width: 60 }]}>Motion</Text>
            <Text style={[s.thCell, { flex: 1 }]}>Detail</Text>
            <Text style={[s.thCell, { width: 50, textAlign: "center" as const }]}>For</Text>
            <Text style={[s.thCell, { width: 60, textAlign: "center" as const }]}>Against</Text>
            <Text style={[s.thCell, { width: 60, textAlign: "center" as const }]}>Abstain</Text>
          </View>
          {(motions.length > 0 ? motions : [{ position: 0, title: "(No formal motions , general business only)", motion: "" }]).map((m, i) => (
            <View key={i} style={s.tr}>
              <Text style={[s.td, { width: 60, fontWeight: 700 }]}>{motions.length > 0 ? `Motion ${i + 1}` : "-"}</Text>
              <Text style={[s.td, { flex: 1 }]}>{m.title}</Text>
              <Text style={[s.td, { width: 50, textAlign: "center" as const }]}>{"☐"}</Text>
              <Text style={[s.td, { width: 60, textAlign: "center" as const }]}>{"☐"}</Text>
              <Text style={[s.td, { width: 60, textAlign: "center" as const }]}>{"☐"}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Part C , Lodgement</Text>
        <Text style={s.para}>This form must be received by {managementCompany.name} no later than 24 hours before the meeting.</Text>
        {managementCompany.email ? <View style={s.bullet}><Text style={s.bulletDot}>{"•"}</Text><Text style={s.bulletText}>Email: {managementCompany.email}</Text></View> : null}
        {managementCompany.phone ? <View style={s.bullet}><Text style={s.bulletDot}>{"•"}</Text><Text style={s.bulletText}>Phone (queries): {managementCompany.phone}</Text></View> : null}
        <Text style={[s.motionMeta, { marginTop: 14 }]}>Reference: {referenceNumber}</Text>
      </Page>
    </Document>
  );
}
