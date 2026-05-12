import React from "react";
import { Page, View, Text, Document } from "@react-pdf/renderer";
import { baseStyles, colors } from "../styles";
import type { MeetingMinutesProps, Attendee } from "../types";
import { PDFHeader, PDFFooter, PDFDocumentTitle } from "./base-template-parts";

const meetingTypeLabels = {
  AGM: "Annual General Meeting",
  SGM: "Special General Meeting",
  Committee: "Committee Meeting",
} as const;

function AttendanceSection({
  title,
  attendees,
}: {
  title: string;
  attendees: Attendee[];
}) {
  if (attendees.length === 0) return null;

  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={[baseStyles.label, { marginBottom: 4 }]}>{title}</Text>
      {attendees.map((a, i) => (
        <Text key={i} style={baseStyles.paragraph}>
          {a.name}
          {a.lot_number ? ` (Lot ${a.lot_number})` : ""}
          {a.proxy_for ? ` — proxy for ${a.proxy_for}` : ""}
        </Text>
      ))}
    </View>
  );
}

export function MeetingMinutes({
  managementCompany,
  oc,
  referenceNumber,
  date,
  meetingType,
  meetingDate,
  meetingTime,
  location,
  attendees,
  quorumMet,
  quorumDetails,
  agendaItems,
  actionItems,
  nextMeetingDate,
}: MeetingMinutesProps) {
  const present = attendees.filter((a) => a.type === "present");
  const proxies = attendees.filter((a) => a.type === "proxy");
  const apologies = attendees.filter((a) => a.type === "apology");

  const fullTitle = `Minutes — ${meetingTypeLabels[meetingType]}`;

  return (
    <Document>
      <Page size="A4" style={baseStyles.page} wrap>
        <PDFHeader
          managementCompany={managementCompany}
          oc={oc}
          date={date}
        />

        <PDFDocumentTitle
          title={fullTitle}
          referenceNumber={referenceNumber}
        />

        <View style={baseStyles.body}>
          {/* ── Meeting details ── */}
          <View style={{ marginBottom: 16 }}>
            <View style={baseStyles.row}>
              <View style={{ flex: 1 }}>
                <Text style={baseStyles.label}>Date</Text>
                <Text style={baseStyles.value}>{meetingDate}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={baseStyles.label}>Time</Text>
                <Text style={baseStyles.value}>{meetingTime}</Text>
              </View>
            </View>
            <Text style={baseStyles.label}>Location</Text>
            <Text style={baseStyles.value}>{location}</Text>
          </View>

          {/* ── Attendance ── */}
          <Text style={baseStyles.sectionTitle}>Attendance</Text>
          <AttendanceSection title="Present" attendees={present} />
          <AttendanceSection title="By proxy" attendees={proxies} />
          <AttendanceSection title="Apologies" attendees={apologies} />

          {/* ── Quorum ── */}
          <View
            style={{
              marginTop: 4,
              marginBottom: 16,
              padding: 8,
              backgroundColor: quorumMet ? colors.tableStripe : "#fef2f2",
              borderWidth: 1,
              borderColor: quorumMet ? colors.border : colors.destructive,
            }}
          >
            <Text style={[baseStyles.paragraph, baseStyles.bold]}>
              Quorum: {quorumMet ? "Achieved" : "Not achieved"}
            </Text>
            {quorumDetails ? (
              <Text style={{ fontSize: 9, color: colors.muted }}>
                {quorumDetails}
              </Text>
            ) : null}
          </View>

          {/* ── Agenda items ── */}
          <Text style={baseStyles.sectionTitle}>Agenda</Text>
          {agendaItems.map((item, i) => (
            <View
              key={i}
              style={{
                marginBottom: 14,
                paddingBottom: 10,
                borderBottomWidth: i < agendaItems.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
              }}
              wrap={false}
            >
              <Text style={[baseStyles.paragraph, baseStyles.bold]}>
                {item.number}. {item.title}
              </Text>

              {item.notes ? (
                <Text style={baseStyles.paragraph}>{item.notes}</Text>
              ) : null}

              {item.motion ? (
                <View style={{ marginTop: 4, marginBottom: 4 }}>
                  <Text style={baseStyles.label}>Motion</Text>
                  <Text
                    style={{
                      fontSize: 10,
                      fontStyle: "italic",
                      marginBottom: 4,
                    }}
                  >
                    &ldquo;{item.motion}&rdquo;
                  </Text>
                  {item.moved_by ? (
                    <Text style={{ fontSize: 9, color: colors.muted }}>
                      Moved by {item.moved_by}
                      {item.seconded_by
                        ? `, seconded by ${item.seconded_by}`
                        : ""}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {item.vote ? (
                <View style={baseStyles.table}>
                  <View style={baseStyles.tableHeader}>
                    <Text
                      style={[baseStyles.tableHeaderCell, { flex: 1 }]}
                    >
                      For
                    </Text>
                    <Text
                      style={[baseStyles.tableHeaderCell, { flex: 1 }]}
                    >
                      Against
                    </Text>
                    <Text
                      style={[baseStyles.tableHeaderCell, { flex: 1 }]}
                    >
                      Abstain
                    </Text>
                    <Text
                      style={[baseStyles.tableHeaderCell, { flex: 1 }]}
                    >
                      Result
                    </Text>
                  </View>
                  <View style={baseStyles.tableRow}>
                    <Text style={[baseStyles.tableCell, { flex: 1 }]}>
                      {item.vote.for}
                    </Text>
                    <Text style={[baseStyles.tableCell, { flex: 1 }]}>
                      {item.vote.against}
                    </Text>
                    <Text style={[baseStyles.tableCell, { flex: 1 }]}>
                      {item.vote.abstain}
                    </Text>
                    <Text
                      style={[
                        baseStyles.tableCell,
                        baseStyles.bold,
                        {
                          flex: 1,
                          color:
                            item.result === "PASSED"
                              ? "#00bd7d"
                              : colors.destructive,
                        },
                      ]}
                    >
                      {item.result}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ))}

          {/* ── Action items ── */}
          {actionItems && actionItems.length > 0 ? (
            <>
              <Text style={baseStyles.sectionTitle}>Action items</Text>
              <View style={baseStyles.table}>
                <View style={baseStyles.tableHeader}>
                  <Text style={[baseStyles.tableHeaderCell, { flex: 3 }]}>
                    Action
                  </Text>
                  <Text style={[baseStyles.tableHeaderCell, { flex: 1 }]}>
                    Assigned to
                  </Text>
                  <Text style={[baseStyles.tableHeaderCell, { flex: 1 }]}>
                    Due date
                  </Text>
                </View>
                {actionItems.map((action, i) => (
                  <View
                    key={i}
                    style={
                      i % 2 === 1
                        ? baseStyles.tableRowStriped
                        : baseStyles.tableRow
                    }
                  >
                    <Text style={[baseStyles.tableCell, { flex: 3 }]}>
                      {action.description}
                    </Text>
                    <Text style={[baseStyles.tableCell, { flex: 1 }]}>
                      {action.assigned_to}
                    </Text>
                    <Text style={[baseStyles.tableCell, { flex: 1 }]}>
                      {action.due_date ?? "—"}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* ── Next meeting ── */}
          {nextMeetingDate ? (
            <View style={{ marginTop: 16 }}>
              <Text style={baseStyles.sectionTitle}>Next meeting</Text>
              <Text style={baseStyles.paragraph}>{nextMeetingDate}</Text>
            </View>
          ) : null}
        </View>

        <PDFFooter
          managementCompany={managementCompany}
          referenceNumber={referenceNumber}
          date={date}
        />
      </Page>
    </Document>
  );
}
