"use client";

import { useState } from "react";
import { FileText, Shield, Users, Mail, History, ChevronRight, Download, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateLong } from "@/lib/utils";
import {
  getLevyHistory,
  getInsuranceStatus,
  getLotOwnerRegister,
  getCommunicationLog,
  getAuditTrail,
} from "@/lib/actions/reports";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface LotOption {
  id: string;
  lot_number: number;
  unit_number: string | null;
  owner_name: string | null;
}

type ReportType = "levy_history" | "insurance_status" | "lot_register" | "communication_log" | "audit_trail";

const REPORTS: {
  id: ReportType;
  label: string;
  description: string;
  icon: typeof FileText;
  managerOnly: boolean;
}[] = [
  { id: "levy_history", label: "Levy history", description: "All levy notices with status and payment tracking", icon: FileText, managerOnly: false },
  { id: "insurance_status", label: "Insurance status", description: "Current and past insurance policies with coverage gaps", icon: Shield, managerOnly: false },
  { id: "lot_register", label: "Lot owner register", description: "All lots with owner details and entitlements", icon: Users, managerOnly: false },
  { id: "communication_log", label: "Communication log", description: "All notifications and emails sent", icon: Mail, managerOnly: true },
  { id: "audit_trail", label: "Audit trail", description: "All changes made to subdivision data", icon: History, managerOnly: true },
];

// ─── Report Viewer ─────────────────────────────────────────

function ReportViewer({
  type,
  subdivisionId,
  isLotOwner,
  lots,
  onBack,
}: {
  type: ReportType;
  subdivisionId: string;
  isLotOwner: boolean;
  lots: LotOption[];
  onBack: () => void;
}) {
  const [data, setData] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLotId, setSelectedLotId] = useState<string>("");

  const report = REPORTS.find((r) => r.id === type)!;

  async function loadReport(lotId?: string) {
    setLoading(true);
    let result: unknown[];
    switch (type) {
      case "levy_history":
        result = await getLevyHistory(subdivisionId, lotId || undefined);
        break;
      case "insurance_status":
        result = await getInsuranceStatus(subdivisionId);
        break;
      case "lot_register":
        result = await getLotOwnerRegister(subdivisionId);
        break;
      case "communication_log":
        result = await getCommunicationLog(subdivisionId);
        break;
      case "audit_trail":
        result = await getAuditTrail(subdivisionId);
        break;
      default:
        result = [];
    }
    setData(result);
    setLoading(false);
  }

  // Load on mount
  useState(() => { loadReport(); });

  function handleLotFilter(lotId: string) {
    setSelectedLotId(lotId);
    loadReport(lotId || undefined);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">{report.label}</h1>
        </div>
        {/* Lot filter for levy history (managers only) */}
        {type === "levy_history" && !isLotOwner && (
          <select
            value={selectedLotId}
            onChange={(e) => handleLotFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-3 text-sm"
          >
            <option value="">All lots</option>
            {lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                Lot {lot.lot_number}{lot.owner_name ? ` — ${lot.owner_name}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="py-12 text-center"><p className="text-sm text-muted-foreground">Loading report...</p></CardContent></Card>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-sm text-muted-foreground">No data found.</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-0 px-0">
            <div className="overflow-x-auto">
              {type === "levy_history" && <LevyHistoryTable data={data as LevyRow[]} />}
              {type === "insurance_status" && <InsuranceTable data={data as InsuranceRow[]} />}
              {type === "lot_register" && <LotRegisterTable data={data as LotRow[]} isLotOwner={isLotOwner} />}
              {type === "communication_log" && <CommLogTable data={data as CommRow[]} />}
              {type === "audit_trail" && <AuditTable data={data as AuditRow[]} />}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Table components ──────────────────────────────────────

interface LevyRow { lot_number: number; unit_number: string | null; owner_name: string | null; reference_number: string; period_start: string; period_end: string; amount: number; amount_paid: number; status: string; due_date: string; issued_at: string | null; pdf_url: string | null; }

function LevyHistoryTable({ data }: { data: LevyRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2.5 text-left">Lot</th>
          <th className="px-4 py-2.5 text-left">Reference</th>
          <th className="px-4 py-2.5 text-left">Period</th>
          <th className="px-4 py-2.5 text-left">Due</th>
          <th className="px-4 py-2.5 text-right">Amount</th>
          <th className="px-4 py-2.5 text-right">Paid</th>
          <th className="px-4 py-2.5 text-left">Status</th>
          <th className="px-4 py-2.5 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {data.map((l, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="px-4 py-2.5 text-foreground">Lot {l.lot_number}</td>
            <td className="px-4 py-2.5 text-foreground font-medium">{l.reference_number}</td>
            <td className="px-4 py-2.5 text-foreground text-xs">{formatDateLong(l.period_start)} — {formatDateLong(l.period_end)}</td>
            <td className="px-4 py-2.5 text-foreground">{formatDateLong(l.due_date)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(l.amount)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums text-[hsl(160,100%,37%)]">{formatCurrency(l.amount_paid)}</td>
            <td className="px-4 py-2.5">
              <Badge variant={l.status === "paid" ? "success" : l.status === "overdue" ? "destructive" : l.status === "draft" ? "neutral" : "info"}>
                {l.status}
              </Badge>
            </td>
            <td className="px-4 py-2.5">
              {l.pdf_url && (
                <a href={l.pdf_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface InsuranceRow { policy_type: string; provider: string; policy_number: string | null; sum_insured: number | null; premium: number | null; start_date: string; end_date: string; is_expired: boolean; is_expiring_soon: boolean; document_url?: string | null; }

const POLICY_LABELS: Record<string, string> = {
  building: "Building", public_liability: "Public liability", contents: "Contents",
  workers_comp: "Workers comp", office_bearers: "Office bearers", fidelity: "Fidelity guarantee", other: "Other",
};

function InsuranceTable({ data }: { data: InsuranceRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2.5 text-left">Type</th>
          <th className="px-4 py-2.5 text-left">Provider</th>
          <th className="px-4 py-2.5 text-left">Policy #</th>
          <th className="px-4 py-2.5 text-left">Coverage</th>
          <th className="px-4 py-2.5 text-right">Sum insured</th>
          <th className="px-4 py-2.5 text-right">Premium</th>
          <th className="px-4 py-2.5 text-left">Status</th>
          <th className="px-4 py-2.5 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {data.map((p, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="px-4 py-2.5 text-foreground font-medium">{POLICY_LABELS[p.policy_type] ?? p.policy_type}</td>
            <td className="px-4 py-2.5 text-foreground">{p.provider}</td>
            <td className="px-4 py-2.5 text-foreground">{p.policy_number ?? "—"}</td>
            <td className="px-4 py-2.5 text-foreground text-xs">{formatDateLong(p.start_date)} — {formatDateLong(p.end_date)}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{p.sum_insured ? formatCurrency(p.sum_insured) : "—"}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{p.premium ? formatCurrency(p.premium) : "—"}</td>
            <td className="px-4 py-2.5">
              {p.is_expired ? <Badge variant="destructive">Expired</Badge>
                : p.is_expiring_soon ? <Badge variant="warning">Expiring soon</Badge>
                : <Badge variant="success">Active</Badge>}
            </td>
            <td className="px-4 py-2.5">
              {p.document_url && (
                <a href={p.document_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface LotRow { lot_number: number; unit_number: string | null; owner_name: string | null; owner_email: string | null; owner_phone: string | null; lot_entitlement: number; lot_liability: number; owner_occupied: boolean | null; }

function LotRegisterTable({ data, isLotOwner }: { data: LotRow[]; isLotOwner: boolean }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2.5 text-left">Lot</th>
          <th className="px-4 py-2.5 text-left">Owner</th>
          {!isLotOwner && <th className="px-4 py-2.5 text-left">Email</th>}
          {!isLotOwner && <th className="px-4 py-2.5 text-left">Phone</th>}
          <th className="px-4 py-2.5 text-right">Entitlement</th>
          <th className="px-4 py-2.5 text-right">Liability</th>
          {!isLotOwner && <th className="px-4 py-2.5 text-left">Occupied</th>}
        </tr>
      </thead>
      <tbody>
        {data.map((lot, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="px-4 py-2.5 text-foreground font-medium">
              Lot {lot.lot_number}{lot.unit_number ? ` (Unit ${lot.unit_number})` : ""}
            </td>
            <td className="px-4 py-2.5 text-foreground">{lot.owner_name ?? "Unassigned"}</td>
            {!isLotOwner && <td className="px-4 py-2.5 text-foreground">{lot.owner_email ?? "—"}</td>}
            {!isLotOwner && <td className="px-4 py-2.5 text-foreground">{lot.owner_phone ?? "—"}</td>}
            <td className="px-4 py-2.5 text-right tabular-nums">{lot.lot_entitlement || "—"}</td>
            <td className="px-4 py-2.5 text-right tabular-nums">{lot.lot_liability || "—"}</td>
            {!isLotOwner && <td className="px-4 py-2.5">{lot.owner_occupied === null ? "—" : lot.owner_occupied ? "Yes" : "No"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface CommRow { id: string; type: string; description: string; detail: string; date: string; channel: "notification" | "email"; }

function CommLogTable({ data }: { data: CommRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2.5 text-left">Date</th>
          <th className="px-4 py-2.5 text-left">Type</th>
          <th className="px-4 py-2.5 text-left">Description</th>
          <th className="px-4 py-2.5 text-left">Detail</th>
          <th className="px-4 py-2.5 text-left">Channel</th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="px-4 py-2.5 text-foreground text-xs">{formatDateLong(entry.date)}</td>
            <td className="px-4 py-2.5"><Badge variant="neutral">{entry.type}</Badge></td>
            <td className="px-4 py-2.5 text-foreground">{entry.description}</td>
            <td className="px-4 py-2.5 text-muted-foreground text-xs">{entry.detail}</td>
            <td className="px-4 py-2.5"><Badge variant="info">{entry.channel}</Badge></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface AuditRow { id: string; action: string; entity_type: string; entity_id: string; before_state: unknown; after_state: unknown; date: string; user_name: string; }

function AuditTable({ data }: { data: AuditRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <th className="px-4 py-2.5 text-left">Date</th>
          <th className="px-4 py-2.5 text-left">User</th>
          <th className="px-4 py-2.5 text-left">Action</th>
          <th className="px-4 py-2.5 text-left">Entity</th>
          <th className="px-4 py-2.5 text-left">Changes</th>
        </tr>
      </thead>
      <tbody>
        {data.map((entry, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="px-4 py-2.5 text-foreground text-xs">{formatDateLong(entry.date)}</td>
            <td className="px-4 py-2.5 text-foreground">{entry.user_name}</td>
            <td className="px-4 py-2.5"><Badge variant="neutral">{entry.action}</Badge></td>
            <td className="px-4 py-2.5 text-foreground">{entry.entity_type}</td>
            <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">
              {entry.after_state ? JSON.stringify(entry.after_state) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main Component ────────────────────────────────────────

export function ReportsContent({
  subdivisionId,
  isLotOwner,
  lots,
}: {
  subdivisionId: string;
  isLotOwner: boolean;
  lots: LotOption[];
}) {
  const [activeReport, setActiveReport] = useState<ReportType | null>(null);

  const availableReports = REPORTS.filter((r) => !r.managerOnly || !isLotOwner);

  if (activeReport) {
    return (
      <ReportViewer
        type={activeReport}
        subdivisionId={subdivisionId}
        isLotOwner={isLotOwner}
        lots={lots}
        onBack={() => setActiveReport(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Reports</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {availableReports.map((report) => (
          <button
            key={report.id}
            type="button"
            onClick={() => setActiveReport(report.id)}
            className="text-left cursor-pointer"
          >
            <Card className="transition-colors hover:border-primary/30 h-full">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                    <report.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">{report.label}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
