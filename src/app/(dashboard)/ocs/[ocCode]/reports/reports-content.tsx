"use client";

import { useEffect, useState } from "react";
import { Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePicker } from "@/components/shared/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLevyHistory,
  getInsuranceStatus,
  getLotOwnerRegister,
  getCommunicationLog,
  getAuditTrail,
  getOCCertificateData,
  getOutstandingArrearsReport,
  getOwnerStatement,
  getTrustAccountSummary,
} from "@/lib/actions/reports";
import {
  outstandingArrearsToCsv,
  ownerStatementToCsv,
  trustAccountSummaryToCsv,
} from "@/lib/actions/reports-csv";
import {
  LevyHistoryReport,
  InsuranceStatusReport,
  LotRegisterReport,
  CommLogReport,
  AuditTrailReport,
  OutstandingArrearsReport,
  OwnerStatementReportPdf,
  TrustAccountSummaryReport,
} from "@/lib/pdf/templates/report";
import { OCCertificate } from "@/lib/pdf/templates/oc-certificate";

interface LotOption {
  id: string;
  lot_number: number;
  unit_number: string | null;
  owner_display_name: string | null;
}

// Radix Select cannot carry an empty-string item value, so "no lot filter"
// needs a sentinel. It never leaves this component: selectedLotId stays ""
// for "all lots", which is what the report actions expect.
const ALL_LOTS = "__all";

const lotLabel = (lot: LotOption) =>
  `Lot ${lot.lot_number}${lot.owner_display_name ? ` , ${lot.owner_display_name}` : ""}`;

/** Billing cycle is stored snake_case; the user never sees the raw value. */
// Item 4 of the certificate names the fund in a conveyancer's words. Same
// three funds the ledger knows, never the raw fund_type.
const CERT_FUND_OPTIONS = ["Admin Fund", "Capital Works Fund", "Maintenance Plan Fund"];

interface CertLevyRow {
  fund: string;
  amount: string;
  period_start: string;
  period_end: string;
  due_date: string;
}

const BILLING_CYCLE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  annually: "Annually",
};

type ReportType =
  | "levy_history"
  | "insurance_status"
  | "lot_register"
  | "communication_log"
  | "audit_trail"
  | "oc_certificate"
  | "outstanding_arrears"
  | "owner_statement"
  | "trust_account_summary";

const REPORTS: { id: ReportType; label: string; managerOnly: boolean }[] = [
  { id: "oc_certificate", label: "Owners Corporation Certificate", managerOnly: true },
  { id: "outstanding_arrears", label: "Outstanding arrears", managerOnly: true },
  { id: "owner_statement", label: "Owner statement", managerOnly: false },
  { id: "trust_account_summary", label: "Trust account summary", managerOnly: true },
  { id: "levy_history", label: "Levy history", managerOnly: false },
  { id: "insurance_status", label: "Insurance status", managerOnly: false },
  { id: "lot_register", label: "Lot owner register", managerOnly: false },
  { id: "communication_log", label: "Communication log", managerOnly: true },
  { id: "audit_trail", label: "Audit trail", managerOnly: true },
];

export function ReportsContent({
  ocId,
  ocName,
  ocAddress,
  ocPlanNumber,
  logoUrl,
  isLotOwner,
  lots,
}: {
  ocId: string;
  ocName: string;
  ocAddress: string;
  ocPlanNumber: string;
  logoUrl: string | null;
  isLotOwner: boolean;
  lots: LotOption[];
}) {
  const [reportType, setReportType] = useState<ReportType | "">("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [certLotId, setCertLotId] = useState("");
  const [certApplicant, setCertApplicant] = useState("");
  const [certEmail, setCertEmail] = useState("");
  const [certAppDate, setCertAppDate] = useState<string>(new Date().toISOString().slice(0, 10));
  // Every numbered item on the certificate is editable. The server prefills
  // what it can derive on lot select; the manager owns the final wording,
  // because they are the one signing it.
  const [certDate, setCertDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [certRepairs, setCertRepairs] = useState("n/a");
  const [certFunds, setCertFunds] = useState("n/a");
  const [certLiabilities, setCertLiabilities] = useState("n/a");
  const [certContracts, setCertContracts] = useState("n/a");
  const [certServices, setCertServices] = useState("n/a");
  const [certNotices, setCertNotices] = useState("n/a");
  const [certLegal, setCertLegal] = useState("n/a");
  const [certCurrentFees, setCertCurrentFees] = useState("n/a");
  const [certCurrentFeesNote, setCertCurrentFeesNote] = useState("");
  const [certBillingCycle, setCertBillingCycle] = useState("quarterly");
  const [certFeesPaidUpTo, setCertFeesPaidUpTo] = useState("");
  const [certUnpaidFees, setCertUnpaidFees] = useState("0.00");
  const [certLevies, setCertLevies] = useState<CertLevyRow[]>([]);
  const [certInsurance, setCertInsurance] = useState("n/a");
  const [certInsuranceNote, setCertInsuranceNote] = useState("");
  const [certOwnInsurance, setCertOwnInsurance] = useState("n/a");
  const [certManagerAppointed, setCertManagerAppointed] = useState(true);
  const [certAdminAppointed, setCertAdminAppointed] = useState(false);
  const [certLastAgm, setCertLastAgm] = useState<string>("");
  const [certAttachments, setCertAttachments] = useState("");
  const [certInspectionAddress, setCertInspectionAddress] = useState("");
  const [certSealText, setCertSealText] = useState("");
  const [prefilling, setPrefilling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  // PP7-B: shared date-range state for outstanding_arrears (as-of) +
  // owner_statement / trust_account_summary (from/to range).
  const todayIso = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgoIso = new Date(Date.now() - 90 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [asOfDate, setAsOfDate] = useState<string>(todayIso);
  const [rangeFrom, setRangeFrom] = useState<string>(ninetyDaysAgoIso);
  const [rangeTo, setRangeTo] = useState<string>(todayIso);
  // CSV holder for the 3 new reports (PDF holder is pdfUrl).
  const [csvBlobUrl, setCsvBlobUrl] = useState<string | null>(null);

  // Prefill fee fields when lot changes
  useEffect(() => {
    if (reportType !== "oc_certificate" || !certLotId) return;
    let cancelled = false;
    setPrefilling(true);
    getOCCertificateData(ocId, certLotId, certApplicant || "", certEmail || "")
      .then((data) => {
        if (cancelled || !data) return;
        setCertCurrentFees(data.currentFees);
        setCertBillingCycle(data.billingCycle);
        // "n/a" is the template's own word for an empty date, not a date.
        setCertFeesPaidUpTo(data.feesPaidUpTo === "n/a" ? "" : data.feesPaidUpTo);
        setCertUnpaidFees(Number(data.unpaidFeesTotal).toFixed(2));
        setCertLastAgm(data.lastAgmDate || "");
        setCertLevies(data.levies.map((l) => ({
          fund: l.fund,
          amount: Number(l.amount).toFixed(2),
          period_start: l.period_start ?? "",
          period_end: l.period_end ?? "",
          due_date: l.due_date ?? "",
        })));
        setCertInsurance(data.insuranceCover);
        setCertManagerAppointed(data.managerAppointed);
        setCertAdminAppointed(data.administratorAppointed);
        setCertInspectionAddress(data.inspectionAddress);
        setCertSealText(data.commonSealText);
      })
      .finally(() => { if (!cancelled) setPrefilling(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certLotId, reportType, ocId]);

  function updateCertLevy(index: number, patch: Partial<CertLevyRow>) {
    setCertLevies((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const availableReports = REPORTS.filter((r) => !r.managerOnly || !isLotOwner);

  // Proxy logo through API to avoid CORS, convert to data URL for react-pdf
  async function getLogoDataUrl(): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(logoUrl)}`);
      if (!res.ok) {
        console.error(`Logo proxy failed (${res.status}) for ${logoUrl}`);
        return null;
      }
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Logo proxy failed", err);
      return null;
    }
  }

  async function handleGenerate() {
    if (!reportType) return;

    setGenerating(true);
    setPdfUrl(null);
    setCsvBlobUrl(null);

    try {
      const subName = `${ocName} · ${ocPlanNumber}`;
      const subAddr = ocAddress;
      const logoDataUrl = await getLogoDataUrl();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let element: any;
      // PP7-B: holds CSV string for the 3 new reports; converted to a blob
      // URL after the switch.
      let csvString: string | null = null;

      switch (reportType) {
        case "levy_history": {
          const data = await getLevyHistory(ocId, selectedLotId || undefined);
          const selectedLot = selectedLotId ? lots.find((l) => l.id === selectedLotId) : null;
          const lotOwnerName = selectedLot?.owner_display_name ?? undefined;
          element = createElement(LevyHistoryReport, { data, title: "Levy History Report", subtitle: subName, address: subAddr, logoUrl: logoDataUrl, lotOwnerName });
          break;
        }
        case "insurance_status": {
          const data = await getInsuranceStatus(ocId);
          element = createElement(InsuranceStatusReport, { data, title: "Insurance Status Report", subtitle: subName, address: subAddr, logoUrl: logoDataUrl });
          break;
        }
        case "lot_register": {
          const data = await getLotOwnerRegister(ocId);
          element = createElement(LotRegisterReport, { data, title: "Lot Owner Register", subtitle: subName, address: subAddr, logoUrl: logoDataUrl, showContact: !isLotOwner });
          break;
        }
        case "communication_log": {
          const data = await getCommunicationLog(ocId);
          element = createElement(CommLogReport, { data, title: "Communication Log Report", subtitle: subName, address: subAddr, logoUrl: logoDataUrl });
          break;
        }
        case "audit_trail": {
          const data = await getAuditTrail(ocId);
          element = createElement(AuditTrailReport, { data, title: "Audit Trail Report", subtitle: subName, address: subAddr, logoUrl: logoDataUrl });
          break;
        }
        case "oc_certificate": {
          if (!certLotId || !certApplicant || !certEmail) {
            toast.error("Please fill in all certificate fields");
            setGenerating(false);
            return;
          }
          const certData = await getOCCertificateData(ocId, certLotId, certApplicant, certEmail);
          if (!certData) { toast.error("Failed to load certificate data"); setGenerating(false); return; }
          // Override with form values
          certData.applicationDate = certAppDate;
          certData.certificateDate = certDate;
          certData.currentFees = certCurrentFees;
          certData.currentFeesNote = certCurrentFeesNote;
          certData.billingCycle = certBillingCycle;
          certData.feesPaidUpTo = certFeesPaidUpTo || "n/a";
          certData.unpaidFeesTotal = Number(certUnpaidFees) || 0;
          certData.levies = certLevies.map((l) => ({
            fund: l.fund,
            amount: Number(l.amount) || 0,
            period_start: l.period_start,
            period_end: l.period_end,
            due_date: l.due_date,
          }));
          certData.repairsInfo = certRepairs;
          certData.insuranceCover = certInsurance;
          certData.insuranceNote = certInsuranceNote;
          certData.ownInsuranceResolution = certOwnInsurance;
          certData.totalFundsHeld = certFunds;
          certData.liabilities = certLiabilities;
          certData.currentContracts = certContracts;
          certData.serviceAgreements = certServices;
          certData.noticesOrders = certNotices;
          certData.legalProceedings = certLegal;
          certData.managerAppointed = certManagerAppointed;
          certData.administratorAppointed = certAdminAppointed;
          certData.lastAgmDate = certLastAgm;
          // One attachment per line, blank lines dropped.
          certData.additionalAttachments = certAttachments
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          certData.inspectionAddress = certInspectionAddress;
          certData.commonSealText = certSealText;
          // Proxy logo and signature for client-side PDF
          const certLogo = certData.logoUrl ? await getLogoDataUrl() : null;
          let certSig: string | null = null;
          if (certData.signatureUrl) {
            try {
              const sigRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(certData.signatureUrl)}`);
              if (sigRes.ok) {
                const sigBlob = await sigRes.blob();
                certSig = await new Promise((r) => { const rd = new FileReader(); rd.onloadend = () => r(rd.result as string); rd.readAsDataURL(sigBlob); });
              } else {
                console.error(`Signature proxy failed (${sigRes.status}) for ${certData.signatureUrl}`);
              }
            } catch (err) {
              console.error("Signature proxy failed", err);
            }
          }
          element = createElement(OCCertificate, { ...certData, logoUrl: certLogo, signatureUrl: certSig });
          break;
        }
        case "outstanding_arrears": {
          const data = await getOutstandingArrearsReport(ocId, asOfDate);
          element = createElement(OutstandingArrearsReport, {
            data,
            title: "Outstanding Arrears Report",
            subtitle: subName,
            address: subAddr,
            logoUrl: logoDataUrl,
            asOfDate,
          });
          csvString = outstandingArrearsToCsv(data);
          break;
        }
        case "owner_statement": {
          if (!selectedLotId) { toast.error("Select a lot"); setGenerating(false); return; }
          const report = await getOwnerStatement(ocId, selectedLotId, rangeFrom, rangeTo);
          element = createElement(OwnerStatementReportPdf, {
            report,
            title: "Owner Statement",
            subtitle: subName,
            address: subAddr,
            logoUrl: logoDataUrl,
          });
          csvString = ownerStatementToCsv(report);
          break;
        }
        case "trust_account_summary": {
          const data = await getTrustAccountSummary(ocId, rangeFrom, rangeTo);
          element = createElement(TrustAccountSummaryReport, {
            data,
            title: "Trust Account Summary",
            subtitle: subName,
            address: subAddr,
            logoUrl: logoDataUrl,
            fromDate: rangeFrom,
            toDate: rangeTo,
          });
          csvString = trustAccountSummaryToCsv(data);
          break;
        }
      }

      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);

      if (csvString) {
        const csvBlob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
        setCsvBlobUrl(URL.createObjectURL(csvBlob));
      }
    } catch (err) {
      console.error("Failed to generate report:", err);
      toast.error(`Failed to generate report: ${err instanceof Error ? err.message : String(err)}`);
    }

    setGenerating(false);
  }

  function handleDownload() {
    if (!pdfUrl || !reportType) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    const reportNames: Record<string, string> = {
      oc_certificate: "OC-Certificate",
      levy_history: "Levy-History-Report",
      insurance_status: "Insurance-Status-Report",
      lot_register: "Lot-Owner-Register",
      communication_log: "Communication-Log",
      audit_trail: "Audit-Trail",
      outstanding_arrears: "Outstanding-Arrears",
      owner_statement: "Owner-Statement",
      trust_account_summary: "Trust-Account-Summary",
    };
    const dateStr = new Date().toISOString().split("T")[0];
    const subSlug = ocName.replace(/\s+/g, "-");
    a.download = `${reportNames[reportType] ?? reportType}-${subSlug}-${dateStr}.pdf`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Reports</h1>

      {/* Controls */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label>Report type</Label>
              <Select
                value={reportType}
                onValueChange={(v) => { setReportType((v ?? "") as ReportType); setPdfUrl(null); }}
              >
                <SelectTrigger className="h-9 w-full">
                  {/* Children, not a bare <SelectValue>. Without them the
                      trigger falls back to the raw value and the manager
                      reads "trust_account_summary" instead of the label. */}
                  <SelectValue placeholder="Select a report...">
                    {REPORTS.find((r) => r.id === reportType)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {availableReports.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* The picker and Generate stay on this row, ALWAYS.
                Report-specific fields go in the block below it.

                They used to share one flex row, so choosing a report inserted
                controls BETWEEN the picker and the button, and the button
                jumped out from under the cursor mid-click. That reflow is
                what read as the page flashing. */}
            <Button onClick={handleGenerate} disabled={!reportType || generating} loading={generating}>
              Generate report
            </Button>

            {pdfUrl && (
              <Button variant="outline" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            )}
          </div>

          {/* empty:hidden so an unchosen report leaves no gap. */}
          <div className="mt-4 flex flex-wrap items-end gap-4 empty:hidden">

            {/* Lot filter for levy history (managers only) */}
            {reportType === "levy_history" && !isLotOwner && (
              <div className="space-y-1.5 min-w-[200px]">
                <Label>Lot owner</Label>
                <Select
                  value={selectedLotId || ALL_LOTS}
                  onValueChange={(v) => setSelectedLotId(!v || v === ALL_LOTS ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="All lots">
                      {selectedLotId
                        ? lotLabel(lots.find((l) => l.id === selectedLotId)!)
                        : "All lots"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_LOTS}>All lots</SelectItem>
                    {lots.map((lot) => (
                      <SelectItem key={lot.id} value={lot.id}>{lotLabel(lot)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* PP7-B: As-of date for Outstanding arrears */}
            {reportType === "outstanding_arrears" && (
              <div className="space-y-1.5 min-w-[180px]">
                <Label>As of</Label>
                <DatePicker value={asOfDate} onChange={setAsOfDate} />
              </div>
            )}

            {/* PP7-B: Lot + date range for Owner statement */}
            {reportType === "owner_statement" && (
              <>
                <div className="space-y-1.5 min-w-[200px]">
                  <Label>Lot</Label>
                  <Select value={selectedLotId} onValueChange={(v) => setSelectedLotId(v ?? "")}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select lot...">
                        {selectedLotId
                          ? lotLabel(lots.find((l) => l.id === selectedLotId)!)
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lots.map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>{lotLabel(lot)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-[160px]">
                  <Label>From</Label>
                  <DatePicker value={rangeFrom} onChange={setRangeFrom} />
                </div>
                <div className="space-y-1.5 min-w-[160px]">
                  <Label>To</Label>
                  <DatePicker value={rangeTo} onChange={setRangeTo} />
                </div>
              </>
            )}

            {/* PP7-B: Date range for Trust account summary */}
            {reportType === "trust_account_summary" && (
              <>
                <div className="space-y-1.5 min-w-[160px]">
                  <Label>From</Label>
                  <DatePicker value={rangeFrom} onChange={setRangeFrom} />
                </div>
                <div className="space-y-1.5 min-w-[160px]">
                  <Label>To</Label>
                  <DatePicker value={rangeTo} onChange={setRangeTo} />
                </div>
              </>
            )}

            {/* OC Certificate fields */}
            {reportType === "oc_certificate" && (
              <>
                <div className="space-y-1.5 min-w-[200px]">
                  <Label>Lot</Label>
                  <Select value={certLotId} onValueChange={(v) => setCertLotId(v ?? "")}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select lot...">
                        {certLotId
                          ? lotLabel(lots.find((l) => l.id === certLotId)!)
                          : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lots.map((lot) => (
                        <SelectItem key={lot.id} value={lot.id}>{lotLabel(lot)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-[180px]">
                  <Label>Applicant name</Label>
                  <Input value={certApplicant} onChange={(e) => setCertApplicant(e.target.value)} placeholder="Applicant name" className="h-9" />
                </div>
                <div className="space-y-1.5 min-w-[180px]">
                  <Label>Delivery email</Label>
                  <Input value={certEmail} onChange={(e) => setCertEmail(e.target.value)} placeholder="email@example.com" className="h-9" />
                </div>
                <div className="space-y-1.5 min-w-[150px]">
                  <Label>Application received</Label>
                  <DatePicker value={certAppDate} onChange={setCertAppDate} />
                </div>
                <div className="space-y-1.5 min-w-[150px]">
                  <Label>Certificate date</Label>
                  <DatePicker value={certDate} onChange={setCertDate} />
                </div>
              </>
            )}

            {/* OC Certificate detail fields , every numbered item is editable */}
            {reportType === "oc_certificate" && certLotId && (
              <div className="w-full border-t border-border pt-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">1. Current fees{prefilling ? " (loading…)" : ""}</Label>
                  <NumberInput value={certCurrentFees} onChange={setCertCurrentFees} thousandsSeparator prefix="$" allowDecimal placeholder="Current fees" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Billing cycle</Label>
                  <Select value={certBillingCycle} onValueChange={(v) => setCertBillingCycle(v ?? "monthly")}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Billing cycle">
                        {BILLING_CYCLE_LABEL[certBillingCycle]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(BILLING_CYCLE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Note under current fees</Label>
                  <Input value={certCurrentFeesNote} onChange={(e) => setCertCurrentFeesNote(e.target.value)} placeholder="Anything further about the fees for this lot" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">2. Fees paid up to</Label>
                  <DatePicker value={certFeesPaidUpTo} onChange={setCertFeesPaidUpTo} placeholder="Leave blank for n/a" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">3. Unpaid fees total</Label>
                  <NumberInput value={certUnpaidFees} onChange={setCertUnpaidFees} thousandsSeparator prefix="$" allowDecimal placeholder="Unpaid fees total" className="h-8 text-sm" />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">4. Fees and levies struck</Label>
                  {certLevies.length > 0 && (
                    <div className="hidden sm:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                      <Label className="text-xs">Fund</Label>
                      <Label className="text-xs">Amount</Label>
                      <Label className="text-xs">Period start</Label>
                      <Label className="text-xs">Period end</Label>
                      <Label className="text-xs">Due date</Label>
                      <span className="w-8" />
                    </div>
                  )}
                  {certLevies.map((row, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                      <Select value={row.fund} onValueChange={(v) => updateCertLevy(i, { fund: v ?? row.fund })}>
                        <SelectTrigger className="h-8 w-full text-sm">
                          <SelectValue placeholder="Fund">{row.fund}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CERT_FUND_OPTIONS.map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <NumberInput value={row.amount} onChange={(v) => updateCertLevy(i, { amount: v })} thousandsSeparator prefix="$" allowDecimal placeholder="Amount" className="h-8 text-sm" />
                      <DatePicker value={row.period_start} onChange={(v) => updateCertLevy(i, { period_start: v })} placeholder="Period start" className="h-8 text-sm" />
                      <DatePicker value={row.period_end} onChange={(v) => updateCertLevy(i, { period_end: v })} minDate={row.period_start || undefined} placeholder="Period end" className="h-8 text-sm" />
                      <DatePicker value={row.due_date} onChange={(v) => updateCertLevy(i, { due_date: v })} placeholder="Due date" className="h-8 text-sm" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Remove levy"
                        onClick={() => setCertLevies((rows) => rows.filter((_, r) => r !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-8 text-sm"
                    onClick={() => setCertLevies((rows) => [...rows, { fund: CERT_FUND_OPTIONS[0], amount: "", period_start: "", period_end: "", due_date: "" }])}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add levy
                  </Button>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">5. Repairs, maintenance or other work</Label>
                  <Textarea value={certRepairs} onChange={(e) => setCertRepairs(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">6. Insurance cover</Label>
                  <Textarea value={certInsurance} onChange={(e) => setCertInsurance(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Note under insurance cover</Label>
                  <Input value={certInsuranceNote} onChange={(e) => setCertInsuranceNote(e.target.value)} placeholder="Anything further about the cover" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">7. Resolution on own insurance (Section 63)</Label>
                  <Textarea value={certOwnInsurance} onChange={(e) => setCertOwnInsurance(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">8. Total funds held</Label>
                  <NumberInput value={certFunds} onChange={setCertFunds} thousandsSeparator prefix="$" allowDecimal placeholder="Total funds held" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">9. Liabilities</Label>
                  <Input value={certLiabilities} onChange={(e) => setCertLiabilities(e.target.value)} placeholder="e.g. Nil" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">10. Contracts, leases, licences or agreements</Label>
                  <Textarea value={certContracts} onChange={(e) => setCertContracts(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">11. Service agreements</Label>
                  <Textarea value={certServices} onChange={(e) => setCertServices(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">12. Notices or orders (last 12 months)</Label>
                  <Textarea value={certNotices} onChange={(e) => setCertNotices(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">13. Legal proceedings</Label>
                  <Textarea value={certLegal} onChange={(e) => setCertLegal(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 h-9">
                  <Label className="text-xs">14. Manager appointed</Label>
                  <Switch checked={certManagerAppointed} onCheckedChange={setCertManagerAppointed} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 h-9">
                  <Label className="text-xs">15. Administrator appointed</Label>
                  <Switch checked={certAdminAppointed} onCheckedChange={setCertAdminAppointed} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">16. Last AGM date</Label>
                  <DatePicker value={certLastAgm} onChange={setCertLastAgm} placeholder="Leave blank for n/a" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">17. Further documents attached, one per line</Label>
                  <Textarea value={certAttachments} onChange={(e) => setCertAttachments(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">18. Register inspection address</Label>
                  <Textarea value={certInspectionAddress} onChange={(e) => setCertInspectionAddress(e.target.value)} className="min-h-16 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Common seal wording</Label>
                  <Textarea value={certSealText} onChange={(e) => setCertSealText(e.target.value)} className="min-h-16 text-sm" />
                </div>
              </div>
            )}


            {csvBlobUrl && (
              <Button
                variant="outline"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = csvBlobUrl;
                  const reportNames: Record<string, string> = {
                    outstanding_arrears: "Outstanding-Arrears",
                    owner_statement: "Owner-Statement",
                    trust_account_summary: "Trust-Account-Summary",
                  };
                  const dateStr = new Date().toISOString().split("T")[0];
                  const subSlug = ocName.replace(/\s+/g, "-");
                  a.download = `${reportNames[reportType] ?? reportType}-${subSlug}-${dateStr}.csv`;
                  a.click();
                }}
                className="cursor-pointer"
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* PDF Preview */}
      {pdfUrl && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <iframe
              src={pdfUrl}
              className="w-full border-none"
              style={{ height: "80vh" }}
              title="Report preview"
            />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!pdfUrl && !generating && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Select a report type and click generate to preview.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
