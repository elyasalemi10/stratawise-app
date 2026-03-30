import React from "react";
import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import type { LevyNoticeProps } from "../types";
import "../fonts"; // Register NunitoSans

const BPAY_LOGO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwQDAwQEBAQFBQQFBwsHBwYGBw4KCggLEA4RERAOEA8SFBoWEhMYEw8QFh8XGBsbHR0dERYgIh8cIhocHRz/2wBDAQUFBQcGBw0HBw0cEhASHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBz/wAARCABvAPQDAREAAhEBAxEB/8QAHQAAAgMAAwEBAAAAAAAAAAAAAAkBBwgCAwYFBP/EAFcQAAECBAIFBggJBwgHCQAAAAECAwAEBREGBwgSITFBGFFWYXHSEyI3dYGSlLMUFRYyntFFQVxhsoOUpfIXIzRicoLwJEJSVKOz0wlDRJWmo7HB1P/EABoBAQADAQEBAAAAAAAAAAAAAAABBQYEAwf/xAAyEQACAQMDAwIFAwQCAwAAAAAAAQIDBBEFEiExQVETImEyQlJxgRQjkaGxwQYz0fDx/9oADAMBAAIRAxEAPwCvs+9Kd/J/FrGHZPD7dSeVKpmXHnpgtJSFFRABH9E74taF9G3p70le5yV7SVaW1FdS5VfL7rF7/IuQ5v01fdjtWRwT/WxV1OPSE2HlniV3G+BaFiR6XTLOVWUbmEspWrVBBG0E7xFFXoO3rSpN3svBa0a26pRqJWeD07ySU3TYm24mwP8AGjxZ9mIpjT1rErNPtJwZIkNrKLmdXtsSP6MaCOR06bvtSVjlqZdJ+9P8jzOLcaY7xfl5TcW4qm8R1N5KJKXkmiGGm0JsgIAHOSSSSTcmK+V3K7ntVJqMfodcbaNvRjTc3Z9yidAHNeuYSxRJYQqU0qcw/VHBKttq3FhauDqDwI5wCDsULjYb2OAuKFJOcGv7OW4pOtVXuRt7SD0c8IaZsszUcN0uk/FuEHW3J+XYQlthR4PtAbD1jYYq8NkvpKt1cUmu3JZ4S/hUltiXFG3skdI2kZYaWmN/4GUIG/wCCvgH+8iryfLYf+Cn9WeD1SjP9/wD4GcVOqccddcUVuOKKlKJuVKJuST1kmNhFJJJdDNttvLPwPTUwt1ISl1Olx5ypUBfXPaA4hJuhQ4Eg/2hERO3p1Fd0oyR50Kjt6saieUfnUtaW1FKkkKBNwQbgiPNxa4LByT4OB4RKdwEB//Z";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  stripe: "#f5f7fa",
  white: "#ffffff",
  destructive: "#ef4444",
};

const FONT = "NunitoSans";
const FONT_BOLD = "NunitoSans";

function fmt(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${formatted}` : `$${formatted}`;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function LevyNotice({
  managementCompany,
  subdivision,
  referenceNumber,
  date,
  lotOwner,
  levyPeriod,
  lineItems,
  totalDue,
  dueDate,
  paymentInstructions,
  outstandingBalances,
  brandColors,
}: LevyNoticeProps) {
  const hasOutstanding = outstandingBalances && outstandingBalances.length > 0;
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const brand1 = brandColors?.primary ?? "#2b7fff";
  const brand2 = brandColors?.secondary ?? "#00bd7d";

  const s = StyleSheet.create({
    page: {
      fontFamily: FONT,
      fontSize: 10,
      color: c.foreground,
      paddingTop: 28,
      paddingBottom: 20,
      paddingHorizontal: 24,
    },
    // Top section
    topRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 18,
    },
    logo: {
      maxHeight: 60,
      maxWidth: 150,
      objectFit: "contain" as const,
    },
    titleBlock: {
      alignItems: "flex-end" as const,
    },
    levyTitle: {
      fontSize: 22,
      fontFamily: FONT_BOLD,
      fontWeight: 600,
      color: c.foreground,
      textAlign: "right" as const,
    },
    levySubtitle: {
      fontSize: 9,
      color: c.muted,
      marginTop: 2,
      textAlign: "right" as const,
    },
    // Info section
    infoRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 12,
      marginBottom: 18,
      gap: 20,
    },
    infoLeft: { flex: 1 },
    infoLine: { flexDirection: "row", marginBottom: 4 },
    infoLabel: { fontSize: 9, color: c.muted, width: 60 },
    infoValue: { fontSize: 10, fontFamily: FONT, color: c.foreground, flex: 1 },
    infoValueBold: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, flex: 1 },
    // Owner box: fixed width, independent of left content (#5), right-aligned text (#8)
    ownerBox: {
      width: 200,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
      alignItems: "flex-end" as const,
    },
    ownerName: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, marginBottom: 2, textAlign: "right" as const },
    ownerDetail: { fontSize: 10, color: c.foreground, lineHeight: 1.4, textAlign: "right" as const },
    // Table — header bleeds to edges (#7), taller rows (#2)
    tableHeader: {
      flexDirection: "row",
      backgroundColor: brand1,
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableHeaderCell: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.white },
    // Rows bleed to edges but content indented (#3 no borders, #7 full-width colour)
    tableRow: {
      flexDirection: "row",
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
    },
    tableRowStriped: {
      flexDirection: "row",
      paddingVertical: 10,
      marginHorizontal: -24,
      paddingLeft: 32,
      paddingRight: 32,
      backgroundColor: c.stripe,
    },
    tableCell: { fontSize: 10, color: c.foreground },
    tableCellRight: { fontSize: 10, color: c.foreground, textAlign: "right" as const },
    // Totals
    totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 14, marginTop: 6 },
    totalsBlock: { width: 240 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 6 },
    totalLabel: { fontSize: 10, color: c.muted },
    totalValue: { fontSize: 10, color: c.foreground, textAlign: "right" as const },
    totalDueRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderTopWidth: 1.5,
      borderTopColor: c.foreground,
      marginTop: 2,
    },
    totalDueLabel: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 700, color: c.foreground },
    totalDueValue: { fontSize: 11, fontFamily: FONT_BOLD, fontWeight: 700, color: c.foreground, textAlign: "right" as const },
    // Due date — both label and value use brand colour (#10)
    dueRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center" as const, marginBottom: 14, gap: 12 },
    dueLabel: { fontSize: 12, fontFamily: FONT_BOLD, fontWeight: 600, color: brand2 },
    dueValue: { fontSize: 14, fontFamily: FONT_BOLD, fontWeight: 700, color: brand2 },
    // Tear line
    tearLine: { borderBottomWidth: 1, borderBottomColor: c.border, borderStyle: "dashed" as const, marginVertical: 14 },
    // Payment slip — company info on the right (#1)
    paymentSlip: { flexDirection: "row", gap: 20 },
    paymentLeft: { flex: 1 },
    paymentRight: {
      width: 210,
      backgroundColor: c.lightBg,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      borderRadius: 2,
    },
    paymentTitle: { fontSize: 14, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, marginBottom: 10 },
    // Bigger bank text (#9)
    bankRow: { flexDirection: "row", marginBottom: 5 },
    bankLabel: { fontSize: 13, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, width: 110 },
    bankValue: { fontSize: 13, color: c.foreground },
    bankSectionLabel: { fontSize: 14, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, marginBottom: 8 },
    bpayLogo: { width: 64, height: 26, objectFit: "contain" as const, marginBottom: 8 },
    slipRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    slipLabel: { fontSize: 9, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground },
    slipValue: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, textAlign: "right" as const },
    // Outstanding
    sectionTitle: { fontSize: 10, fontFamily: FONT_BOLD, fontWeight: 600, color: c.foreground, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 6 },
    outstandingSection: { marginBottom: 14 },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Top: Logo + Title ── */}
        <View style={s.topRow}>
          <View style={{ maxWidth: 150 }}>
            {managementCompany.logo_url ? (
              <Image src={managementCompany.logo_url} style={s.logo} />
            ) : null}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.levyTitle}>Levy Notice</Text>
            <Text style={s.levySubtitle}>{referenceNumber}</Text>
            <Text style={s.levySubtitle}>{levyPeriod.start} — {levyPeriod.end}</Text>
          </View>
        </View>

        {/* ── Info row ── */}
        <View style={s.infoRow}>
          <View style={s.infoLeft}>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issued for</Text>
              {/* #4: Remove brackets around plan number */}
              <Text style={s.infoValueBold}>{subdivision.name} {subdivision.plan_number}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Address</Text>
              <Text style={s.infoValue}>{subdivision.address}</Text>
            </View>
            {subdivision.abn ? (
              <View style={s.infoLine}>
                <Text style={s.infoLabel}>ABN</Text>
                <Text style={s.infoValue}>{subdivision.abn}</Text>
              </View>
            ) : null}
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Issue date</Text>
              <Text style={s.infoValue}>{fmtDate(date)}</Text>
            </View>
            <View style={s.infoLine}>
              <Text style={s.infoLabel}>Due date</Text>
              <Text style={s.infoValueBold}>{dueDate}</Text>
            </View>
          </View>

          {/* #5: Fixed-width owner box, #8: right-aligned text */}
          <View style={s.ownerBox}>
            <Text style={s.ownerName}>{lotOwner.name}</Text>
            <Text style={s.ownerDetail}>{lotOwner.address}</Text>
            <Text style={s.ownerDetail}>Lot {lotOwner.lot_number}</Text>
          </View>
        </View>

        {/* ── Line items (#2 taller, #3 no borders, #7 colours bleed to edges) ── */}
        <View style={{ marginBottom: 4 }}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderCell, { flex: 4 }]}>Description</Text>
            <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
          </View>
          {lineItems.map((item, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRowStriped : s.tableRow}>
              <Text style={[s.tableCell, { flex: 4 }]}>{item.description}</Text>
              <Text style={[s.tableCellRight, { flex: 1 }]}>{fmt(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalsSection}>
          <View style={s.totalsBlock}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal</Text>
              <Text style={s.totalValue}>{fmt(subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GST</Text>
              <Text style={s.totalValue}>$0.00</Text>
            </View>
            <View style={s.totalDueRow}>
              <Text style={s.totalDueLabel}>Total amount due</Text>
              <Text style={s.totalDueValue}>{fmt(totalDue)}</Text>
            </View>
          </View>
        </View>

        {/* ── Due date (#10 both label and value use brand colour) ── */}
        <View style={s.dueRow}>
          <Text style={s.dueLabel}>Payment due</Text>
          <Text style={s.dueValue}>{dueDate}</Text>
        </View>

        {/* ── Outstanding balances ── */}
        {hasOutstanding ? (
          <View style={s.outstandingSection}>
            <Text style={s.sectionTitle}>Outstanding balances</Text>
            <View>
              <View style={s.tableHeader}>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Reference</Text>
                <Text style={[s.tableHeaderCell, { flex: 2 }]}>Period</Text>
                <Text style={[s.tableHeaderCell, { flex: 1, textAlign: "right" as const }]}>Amount</Text>
              </View>
              {outstandingBalances.map((bal, i) => (
                <View key={i} style={i % 2 === 0 ? s.tableRowStriped : s.tableRow}>
                  <Text style={[s.tableCell, { flex: 2 }]}>{bal.reference}</Text>
                  <Text style={[s.tableCell, { flex: 2 }]}>{bal.period}</Text>
                  <Text style={[s.tableCellRight, { flex: 1, color: c.destructive }]}>{fmt(bal.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Tear line ── */}
        <View style={s.tearLine} />

        {/* ── Payment slip (#1 company info on right, #9 bigger text) ── */}
        <View style={s.paymentSlip}>
          <View style={s.paymentLeft}>
            <Text style={s.paymentTitle}>Payment details</Text>

            <Text style={s.bankSectionLabel}>Bank transfer</Text>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>BSB:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.bsb}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account No.:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.account_number}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Account name:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.account_name}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>Reference:</Text>
              <Text style={s.bankValue}>{paymentInstructions.eft.reference}</Text>
            </View>

            {paymentInstructions.bpay ? (
              <View style={{ marginTop: 14 }}>
                <Image src={BPAY_LOGO} style={s.bpayLogo} />
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Biller code:</Text>
                  <Text style={s.bankValue}>{paymentInstructions.bpay.biller_code}</Text>
                </View>
                <View style={s.bankRow}>
                  <Text style={s.bankLabel}>Reference:</Text>
                  <Text style={s.bankValue}>{paymentInstructions.bpay.reference}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* #1: Company info moved to right side */}
          <View style={s.paymentRight}>
            <Text style={[s.ownerDetail, { fontFamily: FONT_BOLD, fontWeight: 600, textAlign: "left" as const }]}>
              {managementCompany.name}
            </Text>
            <Text style={[s.ownerDetail, { marginTop: 3, textAlign: "left" as const }]}>Lot {lotOwner.lot_number}</Text>
            <Text style={[s.ownerDetail, { textAlign: "left" as const }]}>{subdivision.address}</Text>

            <View style={{ marginTop: 8, borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 }}>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Total payable:</Text>
                <Text style={s.slipValue}>{fmt(totalDue)}</Text>
              </View>
              <View style={s.slipRow}>
                <Text style={s.slipLabel}>Due date:</Text>
                <Text style={s.slipValue}>{dueDate}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
