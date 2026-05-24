import { Page, View, Text, Image, Document } from "@react-pdf/renderer";
import { StyleSheet } from "@react-pdf/renderer";
import "../fonts";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  border: "#e2e5ea",
  lightBg: "#f8f9fb",
  white: "#ffffff",
  blue: "#2b7fff",
};

const FONT = "NunitoSans";

const s = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 9, color: c.foreground, paddingTop: 28, paddingBottom: 50, paddingHorizontal: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  logo: { maxHeight: 50, maxWidth: 140, objectFit: "contain" as const },
  headerRight: { alignItems: "flex-end" as const, maxWidth: 280 },
  title: { fontSize: 18, fontWeight: 700, color: c.foreground },
  legalRef: { fontSize: 7, color: c.muted, marginTop: 2, textAlign: "right" as const },
  infoRow: { flexDirection: "row", marginBottom: 3 },
  infoLabel: { fontSize: 8, color: c.muted, width: 160 },
  infoValue: { fontSize: 8, color: c.foreground, fontWeight: 600, flex: 1 },
  section: { marginTop: 14 },
  sectionLabel: { fontSize: 8, fontWeight: 700, color: c.foreground, textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 4, paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: c.border },
  importantBox: { backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fcd34d", borderRadius: 3, padding: 8, marginTop: 10, marginBottom: 10 },
  importantTitle: { fontSize: 9, fontWeight: 700, color: "#92400e", marginBottom: 4 },
  importantText: { fontSize: 8, color: "#92400e", lineHeight: 1.4 },
  item: { marginBottom: 8 },
  itemNumber: { fontSize: 8, fontWeight: 700, color: c.foreground, marginBottom: 2 },
  itemText: { fontSize: 8, color: c.foreground, lineHeight: 1.5 },
  itemMuted: { fontSize: 8, color: c.muted, lineHeight: 1.5, marginTop: 2 },
  // Table for levies
  tableHeader: { flexDirection: "row", backgroundColor: c.blue, paddingVertical: 4, paddingHorizontal: 6, marginTop: 4 },
  th: { fontSize: 7, fontWeight: 700, color: c.white },
  trow: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: c.border },
  td: { fontSize: 8, color: c.foreground },
  tdRight: { fontSize: 8, color: c.foreground, textAlign: "right" as const },
  // Seal section
  sealSection: { marginTop: 20, borderTopWidth: 1, borderTopColor: c.foreground, paddingTop: 12 },
  sealRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sealText: { fontSize: 8, color: c.foreground, lineHeight: 1.5, maxWidth: "60%" },
  sealBox: { borderWidth: 1, borderColor: c.border, padding: 8, textAlign: "center" as const, minWidth: 100 },
  sealBoxText: { fontSize: 7, color: c.muted, textTransform: "uppercase" as const, letterSpacing: 0.5 },
  // Signature
  sigSection: { marginTop: 20 },
  sigImage: { maxHeight: 40, maxWidth: 150, objectFit: "contain" as const, marginTop: 4, marginBottom: 4 },
  sigName: { fontSize: 9, fontWeight: 700, color: c.foreground, marginTop: 2 },
  sigCompany: { fontSize: 8, color: c.muted },
  // Footer
  footer: { position: "absolute" as const, bottom: 20, left: 32, right: 32, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: c.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: c.muted },
});

function fmt(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

function fmtDate(date: string): string {
  if (!date) return "";
  const d = date.includes("T") ? new Date(date) : new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Types ─────────────────────────────────────────────────

export interface OCCertificateProps {
  logoUrl?: string | null;
  signatureUrl?: string | null;

  // OC
  planNumber: string;
  ocAddress: string;
  lotNumber: number;
  lotUnitNumber?: string | null;

  // Applicant
  applicantName: string;
  applicantEmail: string;
  applicationDate: string;
  certificateDate: string;

  // Financials
  currentFees: string;
  currentFeesTable?: { label: string; amount: number }[];
  showSpecialLevyNote?: boolean;
  billingCycle: string;
  feesPaidUpTo: string;
  unpaidFeesTotal: number;

  // Levies
  levies: { fund: string; amount: number; period_start: string; period_end: string; due_date: string }[];

  // Info fields (n/a if not applicable)
  repairsInfo: string;
  insuranceCover: string;
  insuranceNote?: string;
  totalFundsHeld: string;
  liabilities: string;
  currentContracts: string;
  serviceAgreements: string;
  noticesOrders: string;
  legalProceedings: string;
  managerAppointed: boolean;
  administratorAppointed: boolean;
  lastAgmDate: string;

  // Company / seal
  companyName: string;
  registeredName: string;
  companyAddress: string;
  commonSealText: string;
  inspectionAddress: string;
}

export function OCCertificate(props: OCCertificateProps) {
  const {
    logoUrl, signatureUrl, planNumber, ocAddress, lotNumber, lotUnitNumber,
    applicantName, applicantEmail, applicationDate, certificateDate,
    currentFees, currentFeesTable, showSpecialLevyNote, billingCycle, feesPaidUpTo, unpaidFeesTotal, levies,
    repairsInfo, insuranceCover, insuranceNote, totalFundsHeld, liabilities, currentContracts,
    serviceAgreements, noticesOrders, legalProceedings, managerAppointed,
    administratorAppointed, lastAgmDate, companyName, registeredName,
    companyAddress, commonSealText, inspectionAddress,
  } = props;

  const lotLabel = `Lot ${lotNumber}${lotUnitNumber ? ` (Unit ${lotUnitNumber})` : ""}`;

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        {/* Header */}
        <View style={s.header}>
          <View>
            {logoUrl ? <Image src={logoUrl} style={s.logo} /> : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.title}>Owners Corporation Certificate</Text>
            <Text style={s.legalRef}>Owners Corporation Act 2006 Section 151</Text>
            <Text style={s.legalRef}>Owners Corporations Regulations 2018 Regulation 16</Text>
          </View>
        </View>

        {/* Certificate info */}
        <View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Owners corporation number</Text>
            <Text style={s.infoValue}>{planNumber}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Address</Text>
            <Text style={s.infoValue}>{ocAddress}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Certificate for</Text>
            <Text style={s.infoValue}>{lotLabel} on plan of subdivision {planNumber}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Applicant</Text>
            <Text style={s.infoValue}>{applicantName}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Delivery of certificate</Text>
            <Text style={s.infoValue}>{applicantEmail}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Application received</Text>
            <Text style={s.infoValue}>{fmtDate(applicationDate)}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Certificate issued</Text>
            <Text style={s.infoValue}>{fmtDate(certificateDate)}</Text>
          </View>
        </View>

        {/* Important notice */}
        <View style={s.importantBox}>
          <Text style={s.importantTitle}>Important</Text>
          <Text style={s.importantText}>
            The information in this certificate is issued on {fmtDate(certificateDate)}.{"\n"}
            You can inspect the owners corporations register for additional information and you should obtain a new certificate for current information prior to settlement.
          </Text>
        </View>

        {/* Numbered items */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Certificate details</Text>

          <View style={s.item}>
            <Text style={s.itemNumber}>1. Current fees</Text>
            {currentFeesTable && currentFeesTable.length > 0 ? (
              <View>
                <Text style={s.itemText}>The current fees for {lotLabel}, payable {billingCycle}, are:</Text>
                <View style={[s.tableHeader, { marginTop: 4 }]}>
                  <Text style={[s.th, { width: "60%" }]}>Period</Text>
                  <Text style={[s.th, { width: "40%", textAlign: "right" as const }]}>Amount</Text>
                </View>
                {currentFeesTable.map((f, i) => (
                  <View key={i} style={s.trow}>
                    <Text style={[s.td, { width: "60%" }]}>{f.label}</Text>
                    <Text style={[s.tdRight, { width: "40%" }]}>{fmt(f.amount)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.itemText}>The current fees for {lotLabel} are: {currentFees} payable {billingCycle}.</Text>
            )}
            {showSpecialLevyNote !== false ? (
              <Text style={[s.itemText, { marginTop: 2 }]}>A special levy 1 quarter prior to the expiry of the current insurance will be struck to cover insurance costs for the next year.</Text>
            ) : null}
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>2. Fees paid up to</Text>
            <Text style={s.itemText}>The date by which the fees for the lot have been paid up to is: {feesPaidUpTo || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>3. Unpaid fees</Text>
            <Text style={s.itemText}>The total of any unpaid fees or charges for the lot is: {fmt(unpaidFeesTotal)}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>4. Fees and levies struck</Text>
            {levies.length > 0 ? (
              <View>
                <Text style={s.itemText}>The fees or levies which have been struck, and the dates on which they were struck and are payable are:</Text>
                <View style={[s.tableHeader, { marginTop: 4 }]}>
                  <Text style={[s.th, { width: "22%" }]}>Fund</Text>
                  <Text style={[s.th, { width: "16%", textAlign: "right" as const }]}>Amount</Text>
                  <Text style={[s.th, { width: "38%", paddingLeft: 10 }]}>Period</Text>
                  <Text style={[s.th, { width: "24%" }]}>Due date</Text>
                </View>
                {levies.map((l, i) => (
                  <View key={i} style={s.trow}>
                    <Text style={[s.td, { width: "22%" }]}>{l.fund}</Text>
                    <Text style={[s.tdRight, { width: "16%" }]}>{fmt(l.amount)}</Text>
                    <Text style={[s.td, { width: "38%", paddingLeft: 10 }]}>{l.period_start || l.period_end ? `${fmtDate(l.period_start)} to ${fmtDate(l.period_end)}` : ""}</Text>
                    <Text style={[s.td, { width: "24%" }]}>{fmtDate(l.due_date)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.itemMuted}>n/a</Text>
            )}
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>5. Repairs, maintenance or other work</Text>
            <Text style={s.itemText}>{repairsInfo || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>6. Insurance cover</Text>
            <Text style={s.itemText}>{insuranceCover || "n/a"}</Text>
            {insuranceNote ? <Text style={[s.itemMuted, { marginTop: 2 }]}>{insuranceNote}</Text> : null}
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>7. Resolution on own insurance (Section 63)</Text>
            <Text style={s.itemMuted}>n/a</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>8. Total funds held</Text>
            <Text style={s.itemText}>{totalFundsHeld && totalFundsHeld.trim() && totalFundsHeld !== "n/a" ? `$${totalFundsHeld.replace(/^\$/, "")}` : "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>9. Liabilities</Text>
            <Text style={s.itemText}>{liabilities || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>10. Current contracts, leases, licences or agreements</Text>
            <Text style={s.itemText}>{currentContracts || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>11. Service agreements</Text>
            <Text style={s.itemText}>{serviceAgreements || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>12. Notices or orders (last 12 months)</Text>
            <Text style={s.itemText}>{noticesOrders || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>13. Legal proceedings</Text>
            <Text style={s.itemText}>{legalProceedings || "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>14. Manager</Text>
            <Text style={s.itemText}>{managerAppointed ? `A manager has been appointed: ${companyName}` : "No manager is appointed."}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>15. Administrator</Text>
            <Text style={s.itemText}>{administratorAppointed ? "An administrator has been appointed." : "No administrator is appointed."}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>16. Last AGM</Text>
            <Text style={s.itemText}>{lastAgmDate ? fmtDate(lastAgmDate) : "n/a"}</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>17. Documents attached</Text>
            <Text style={s.itemText}>• A copy of Schedule 3 of the Owners Corporations Regulations 2018 entitled &quot;Statement of advice and information for prospective purchasers and lot owners&quot;</Text>
          </View>

          <View style={s.item}>
            <Text style={s.itemNumber}>18. Note</Text>
            <Text style={s.itemMuted}>
              More information can be obtained by an inspection of the owners corporations register.
              Please make your request to inspect the owners corporations register in writing to:
            </Text>
            <Text style={[s.itemText, { marginTop: 4 }]}>{companyName}</Text>
            <Text style={s.itemText}>{inspectionAddress || companyAddress}</Text>
          </View>
        </View>

        {/* Common seal */}
        <View style={s.sealSection}>
          <View style={s.sealRow}>
            <View style={{ maxWidth: "60%" }}>
              <Text style={{ fontSize: 8, fontWeight: 700, color: c.foreground, lineHeight: 1.5 }}>
                THE COMMON SEAL OF THE OWNERS CORPORATION No. {planNumber},
              </Text>
              <Text style={s.sealText}>
                {commonSealText || `was affixed and witnessed by and in the presence of the registered manager in accordance with Section 20(1) and Section 21(2A) of the Owners Corporation Act 2006`}
              </Text>
            </View>
            <View style={s.sealBox}>
              <Text style={s.sealBoxText}>The</Text>
              <Text style={s.sealBoxText}>Common</Text>
              <Text style={s.sealBoxText}>Seal</Text>
            </View>
          </View>
        </View>

        {/* Signature */}
        <View style={s.sigSection}>
          <Text style={s.sigName}>{companyName}</Text>
          <Text style={s.sigCompany}>{companyAddress}</Text>
          <Text style={[s.itemText, { marginTop: 8 }]}>This owners corporation certificate was prepared by:</Text>
          {signatureUrl ? (
            <Image src={signatureUrl} style={s.sigImage} />
          ) : (
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: c.border, width: 150, marginTop: 20, marginBottom: 4 }}>
              <Text style={{ fontSize: 7, color: c.muted }}>(signature)</Text>
            </View>
          )}
          <Text style={s.sigName}>
            {registeredName && registeredName !== companyName
              ? `${registeredName} trading as ${companyName}`
              : companyName}
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Owners Corporation Certificate , {planNumber}</Text>
          <Text style={s.footerText}>Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
