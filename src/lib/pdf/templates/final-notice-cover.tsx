// ============================================================================
// Final-notice cover page (PP7-A).
// ----------------------------------------------------------------------------
// Single-page @react-pdf/renderer page that prefixes the original levy
// notice PDF when the escalation engine fires step 3 (sendFinalNoticeEmail).
// Merged via pdf-lib in src/lib/pdf/merge.ts.
//
// Tone: severe but legally measured — references VCAT (s32 OC Act 2006 Vic)
// without making threats outside statutory bounds. Manager signature
// (signature_url) inlined as <Image> when present; falls back to printed
// manager name + "Authorised by" line otherwise.
// ============================================================================

import { Page, View, Text, Image, Document, StyleSheet } from "@react-pdf/renderer";
import "../fonts";

const c = {
  foreground: "#1a1f2e",
  muted: "#6b7280",
  destructive: "#b91c1c",
  destructiveBg: "#fef2f2",
  destructiveBorder: "#fecaca",
  warningBg: "#fef9f3",
  warningBorder: "#fde7d0",
  border: "#e2e5ea",
};

const FONT = "NunitoSans";

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT,
    fontSize: 11,
    color: c.foreground,
    padding: 48,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  companyBlock: { flexDirection: "column" },
  companyName: { fontSize: 12, fontWeight: 700, color: c.foreground },
  companyLogo: { width: 100, height: 40, objectFit: "contain" },
  banner: {
    backgroundColor: c.destructiveBg,
    borderWidth: 2,
    borderColor: c.destructiveBorder,
    borderStyle: "solid",
    padding: 18,
    marginBottom: 24,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: c.destructive,
    marginBottom: 6,
    letterSpacing: 1,
  },
  bannerSub: { fontSize: 13, fontWeight: 600, color: c.destructive },
  toBlock: { marginBottom: 18 },
  toLabel: { fontSize: 9, color: c.muted, textTransform: "uppercase", marginBottom: 4 },
  toValue: { fontSize: 12, color: c.foreground, fontWeight: 600 },
  body: { fontSize: 11, lineHeight: 1.55, marginBottom: 14, color: c.foreground },
  bodyEmphasis: { fontWeight: 700 },
  detailsBox: {
    backgroundColor: c.warningBg,
    borderWidth: 1,
    borderColor: c.warningBorder,
    borderStyle: "solid",
    padding: 14,
    marginBottom: 18,
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  detailLabel: { fontSize: 10, color: c.muted },
  detailValue: { fontSize: 11, color: c.foreground, fontWeight: 600 },
  detailValueDestructive: { fontSize: 12, color: c.destructive, fontWeight: 700 },
  consequencesTitle: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: c.foreground },
  consequencesText: { fontSize: 10, lineHeight: 1.6, color: c.foreground, marginBottom: 14 },
  signatureBlock: { marginTop: 28, flexDirection: "column" },
  signatureLabel: { fontSize: 9, color: c.muted, marginBottom: 4 },
  signatureImage: { width: 140, height: 40, objectFit: "contain", marginBottom: 4 },
  signatureName: { fontSize: 11, fontWeight: 600, color: c.foreground },
  signatureRole: { fontSize: 9, color: c.muted, marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 48,
    right: 48,
    fontSize: 8,
    color: c.muted,
    textAlign: "center",
  },
  divider: { borderTopWidth: 1, borderColor: c.border, marginTop: 24, marginBottom: 16 },
  attachmentNote: { fontSize: 9, color: c.muted, textAlign: "center", marginTop: 6 },
});

export interface FinalNoticeCoverProps {
  managementCompany: {
    name: string;
    logo_url?: string | null;
    registered_name?: string | null;
  };
  managerName?: string | null;
  signatureUrl?: string | null;
  recipientName: string;
  ocAddress: string;
  lotLabel: string;
  referenceNumber: string;
  dueDate: string;            // formatted, e.g. "15 April 2026"
  amountOutstanding: number;
  penaltyInterestAccrued: number;
  daysOverdue: number;
  issuedDate: string;         // formatted "today"
}

function fmtCurrency(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function FinalNoticeCover(props: FinalNoticeCoverProps) {
  const {
    managementCompany,
    managerName,
    signatureUrl,
    recipientName,
    ocAddress,
    lotLabel,
    referenceNumber,
    dueDate,
    amountOutstanding,
    penaltyInterestAccrued,
    daysOverdue,
    issuedDate,
  } = props;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>
              {managementCompany.registered_name ?? managementCompany.name}
            </Text>
            <Text style={{ fontSize: 9, color: c.muted, marginTop: 2 }}>
              Issued {issuedDate}
            </Text>
          </View>
          {managementCompany.logo_url ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={managementCompany.logo_url} style={styles.companyLogo} />
          ) : null}
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>FINAL NOTICE</Text>
          <Text style={styles.bannerSub}>VCAT referral pending — immediate action required</Text>
        </View>

        <View style={styles.toBlock}>
          <Text style={styles.toLabel}>To</Text>
          <Text style={styles.toValue}>{recipientName}</Text>
          <Text style={{ fontSize: 11, color: c.foreground, marginTop: 2 }}>{lotLabel}</Text>
          <Text style={{ fontSize: 11, color: c.foreground }}>{ocAddress}</Text>
        </View>

        <Text style={styles.body}>
          This is a <Text style={styles.bodyEmphasis}>final notice</Text> in respect of unpaid
          owners corporation levies. Two previous notices have been issued and the levy remains
          outstanding.
        </Text>

        <View style={styles.detailsBox}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reference</Text>
            <Text style={styles.detailValue}>{referenceNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Original due date</Text>
            <Text style={styles.detailValue}>{dueDate}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Days overdue</Text>
            <Text style={styles.detailValue}>{daysOverdue}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount outstanding</Text>
            <Text style={styles.detailValueDestructive}>{fmtCurrency(amountOutstanding)}</Text>
          </View>
          {penaltyInterestAccrued > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Interest accrued</Text>
              <Text style={styles.detailValueDestructive}>{fmtCurrency(penaltyInterestAccrued)}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.consequencesTitle}>Pending recovery action</Text>
        <Text style={styles.consequencesText}>
          If full payment is not received promptly, the owners corporation may commence recovery
          action, including (where appropriate) an application to the Victorian Civil and
          Administrative Tribunal (VCAT) or referral to a debt-recovery agent. Costs of recovery
          may be added to the debt under section 32 of the Owners Corporations Act 2006 (Vic).
        </Text>

        <Text style={styles.consequencesTitle}>How to pay</Text>
        <Text style={styles.consequencesText}>
          Please refer to the attached levy notice for payment instructions. If you have already
          paid, you may disregard this notice — please allow a day or two for reconciliation. If
          you dispute the amount or wish to discuss a payment arrangement, contact your strata
          manager immediately.
        </Text>

        <View style={styles.divider} />

        <View style={styles.signatureBlock}>
          <Text style={styles.signatureLabel}>Authorised by</Text>
          {signatureUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={signatureUrl} style={styles.signatureImage} />
          ) : null}
          <Text style={styles.signatureName}>{managerName ?? managementCompany.name}</Text>
          <Text style={styles.signatureRole}>For and on behalf of the owners corporation</Text>
        </View>

        <Text style={styles.attachmentNote}>
          The original levy notice is attached as the following pages.
        </Text>

        <Text style={styles.footer} fixed>
          This notice is a statutory communication under the Owners Corporations Act 2006 (Vic).
        </Text>
      </Page>
    </Document>
  );
}
