"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { createElement } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getLevyHistory,
  getInsuranceStatus,
  getLotOwnerRegister,
  getCommunicationLog,
  getAuditTrail,
} from "@/lib/actions/reports";
import {
  LevyHistoryReport,
  InsuranceStatusReport,
  LotRegisterReport,
  CommLogReport,
  AuditTrailReport,
} from "@/lib/pdf/templates/report";

interface LotOption {
  id: string;
  lot_number: number;
  unit_number: string | null;
  owner_name: string | null;
}

type ReportType = "levy_history" | "insurance_status" | "lot_register" | "communication_log" | "audit_trail";

const REPORTS: { id: ReportType; label: string; managerOnly: boolean }[] = [
  { id: "levy_history", label: "Levy history", managerOnly: false },
  { id: "insurance_status", label: "Insurance status", managerOnly: false },
  { id: "lot_register", label: "Lot owner register", managerOnly: false },
  { id: "communication_log", label: "Communication log", managerOnly: true },
  { id: "audit_trail", label: "Audit trail", managerOnly: true },
];

export function ReportsContent({
  subdivisionId,
  subdivisionName,
  subdivisionAddress,
  subdivisionPlanNumber,
  logoUrl,
  isLotOwner,
  lots,
}: {
  subdivisionId: string;
  subdivisionName: string;
  subdivisionAddress: string;
  subdivisionPlanNumber: string;
  logoUrl: string | null;
  isLotOwner: boolean;
  lots: LotOption[];
}) {
  const [reportType, setReportType] = useState<ReportType | "">("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const availableReports = REPORTS.filter((r) => !r.managerOnly || !isLotOwner);

  // Convert logo URL to data URL for client-side PDF rendering (avoids CORS)
  async function getLogoDataUrl(): Promise<string | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(logoUrl);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  async function handleGenerate() {
    if (!reportType) return;

    setGenerating(true);
    setPdfUrl(null);

    try {
      const subtitle = `${subdivisionName} · ${subdivisionPlanNumber}\n${subdivisionAddress}`;
      const logoDataUrl = await getLogoDataUrl();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let element: any;

      switch (reportType) {
        case "levy_history": {
          const data = await getLevyHistory(subdivisionId, selectedLotId || undefined);
          const selectedLot = selectedLotId ? lots.find((l) => l.id === selectedLotId) : null;
          const lotOwnerName = selectedLot?.owner_name ?? undefined;
          element = createElement(LevyHistoryReport, { data, title: "Levy History Report", subtitle, logoUrl: logoDataUrl, lotOwnerName });
          break;
        }
        case "insurance_status": {
          const data = await getInsuranceStatus(subdivisionId);
          element = createElement(InsuranceStatusReport, { data, title: "Insurance Status Report", subtitle, logoUrl: logoDataUrl });
          break;
        }
        case "lot_register": {
          const data = await getLotOwnerRegister(subdivisionId);
          element = createElement(LotRegisterReport, { data, title: "Lot Owner Register", subtitle, logoUrl: logoDataUrl, showContact: !isLotOwner });
          break;
        }
        case "communication_log": {
          const data = await getCommunicationLog(subdivisionId);
          element = createElement(CommLogReport, { data, title: "Communication Log Report", subtitle, logoUrl: logoDataUrl });
          break;
        }
        case "audit_trail": {
          const data = await getAuditTrail(subdivisionId);
          element = createElement(AuditTrailReport, { data, title: "Audit Trail Report", subtitle, logoUrl: logoDataUrl });
          break;
        }
      }

      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error("Failed to generate report:", err);
    }

    setGenerating(false);
  }

  function handleDownload() {
    if (!pdfUrl || !reportType) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    const reportNames: Record<string, string> = {
      levy_history: "Levy-History-Report",
      insurance_status: "Insurance-Status-Report",
      lot_register: "Lot-Owner-Register",
      communication_log: "Communication-Log",
      audit_trail: "Audit-Trail",
    };
    const dateStr = new Date().toISOString().split("T")[0];
    const subSlug = subdivisionName.replace(/\s+/g, "-");
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
              <select
                value={reportType}
                onChange={(e) => { setReportType(e.target.value as ReportType); setPdfUrl(null); }}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select a report...</option>
                {availableReports.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Lot filter for levy history (managers only) */}
            {reportType === "levy_history" && !isLotOwner && (
              <div className="space-y-1.5 min-w-[200px]">
                <Label>Lot owner</Label>
                <select
                  value={selectedLotId}
                  onChange={(e) => setSelectedLotId(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">All lots</option>
                  {lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      Lot {lot.lot_number}{lot.owner_name ? ` — ${lot.owner_name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!reportType || generating}
              className="cursor-pointer"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate report"
              )}
            </Button>

            {pdfUrl && (
              <Button variant="outline" onClick={handleDownload} className="cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
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
