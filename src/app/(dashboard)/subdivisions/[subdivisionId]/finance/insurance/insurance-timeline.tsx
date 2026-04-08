"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldAlert, ShieldX, Download, CalendarIcon, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateLong } from "@/lib/utils";
import {
  createInsurancePolicy,
  getInsurancePolicies,
  type InsurancePolicy,
} from "@/lib/actions/insurance";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const POLICY_TYPES = [
  { value: "building", label: "Building" },
  { value: "public_liability", label: "Public liability" },
  { value: "contents", label: "Contents" },
  { value: "workers_comp", label: "Workers compensation" },
  { value: "office_bearers", label: "Office bearers" },
  { value: "fidelity", label: "Fidelity guarantee" },
  { value: "other", label: "Other" },
];

const POLICY_LABELS: Record<string, string> = Object.fromEntries(POLICY_TYPES.map((t) => [t.value, t.label]));

// ─── Amount Input ──────────────────────────────────────────

function AmountInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) onChange(raw);
      }}
      onKeyDown={(e) => { if (e.key === "e" || e.key === "E") e.preventDefault(); }}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
}

// ─── Policy Detail Dialog ──────────────────────────────────

function PolicyDetailDialog({ policy, open, onClose }: { policy: InsurancePolicy | null; open: boolean; onClose: () => void }) {
  if (!policy) return null;
  const isExpired = new Date(policy.end_date) < new Date();
  const isExpiringSoon = !isExpired && new Date(policy.end_date) < new Date(Date.now() + 30 * 86400000);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{POLICY_LABELS[policy.policy_type] ?? policy.policy_type} insurance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Provider</span>
            <span className="text-sm font-medium text-foreground">{policy.provider}</span>
          </div>
          {policy.policy_number && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Policy number</span>
              <span className="text-sm text-foreground">{policy.policy_number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Coverage</span>
            <span className="text-sm text-foreground">{formatDateLong(policy.start_date)} — {formatDateLong(policy.end_date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={isExpired ? "destructive" : isExpiringSoon ? "warning" : "success"}>
              {isExpired ? "Expired" : isExpiringSoon ? "Expiring soon" : "Active"}
            </Badge>
          </div>
          {policy.sum_insured && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Sum insured</span>
              <span className="text-sm font-medium text-foreground">{formatCurrency(Number(policy.sum_insured))}</span>
            </div>
          )}
          {policy.premium && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Premium</span>
              <span className="text-sm text-foreground">{formatCurrency(Number(policy.premium))}</span>
            </div>
          )}
        </div>
        {policy.document_url && (
          <div className="border-t border-border pt-4 mt-2">
            <a href={policy.document_url} target="_blank" rel="noopener noreferrer">
              <Button variant="default" className="w-full cursor-pointer">
                <Download className="mr-2 h-4 w-4" />
                Download certificate of currency
              </Button>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Policy Dialog ─────────────────────────────────────

function AddPolicyDialog({
  open,
  onClose,
  subdivisionId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  subdivisionId: string;
  onCreated: () => void;
}) {
  const [policyType, setPolicyType] = useState("building");
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [premium, setPremium] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [documentUrl, setDocumentUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [pending, setPending] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  async function handleFileUpload(file: File) {
    setUploadName(file.name);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("subdivision_id", subdivisionId);
    formData.append("category", "insurance");
    const res = await fetch("/api/documents", { method: "POST", body: formData });
    if (res.ok) {
      const data = await res.json();
      setDocumentUrl(data.public_url);
      toast.success("Document uploaded");
    } else {
      toast.error("Failed to upload document");
      setUploadName("");
    }
    setUploading(false);
  }

  async function handleSubmit() {
    if (!provider || !startDate || !endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (endDate <= startDate) {
      toast.error("End date must be after start date");
      return;
    }

    setPending(true);
    const result = await createInsurancePolicy(subdivisionId, {
      policy_type: policyType,
      provider,
      policy_number: policyNumber || undefined,
      sum_insured: sumInsured ? Number(sumInsured) : undefined,
      premium: premium ? Number(premium) : undefined,
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(endDate, "yyyy-MM-dd"),
      document_url: documentUrl,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Insurance policy added");
      onCreated();
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>Add insurance policy</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Policy type</Label>
            <select value={policyType} onChange={(e) => setPolicyType(e.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
              {POLICY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Provider *</Label>
            <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. QBE, Allianz" />
          </div>

          <div className="space-y-1.5">
            <Label>Policy number</Label>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Optional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date *</Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {startDate ? format(startDate, "d MMM yyyy") : "Select"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start" side="bottom">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); if (d && endDate && endDate <= d) setEndDate(undefined); setStartOpen(false); }} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>End date *</Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  {endDate ? format(endDate, "d MMM yyyy") : "Select"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2" align="start" side="bottom">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} disabled={startDate ? { before: new Date(startDate.getTime() + 86400000) } : undefined} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sum insured</Label>
              <AmountInput value={sumInsured} onChange={setSumInsured} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Premium</Label>
              <AmountInput value={premium} onChange={setPremium} placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Certificate of currency</Label>
            {uploading ? (
              <div className="flex items-center gap-2 py-2">
                <span className="text-sm text-foreground truncate flex-1">{uploadName}</span>
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
              </div>
            ) : documentUrl ? (
              <div className="flex items-center gap-2 py-2">
                <span className="text-sm text-[hsl(160,100%,37%)] truncate flex-1">{uploadName}</span>
                <button type="button" onClick={() => { setDocumentUrl(undefined); setUploadName(""); }} className="text-muted-foreground hover:text-destructive cursor-pointer">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex h-9 w-full items-center rounded-md border border-border bg-background px-3 text-sm text-muted-foreground cursor-pointer hover:border-primary/50">
                <span>Choose file...</span>
                <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={pending || uploading || !provider || !startDate || !endDate} className="cursor-pointer">
            {pending ? "Adding..." : "Add policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────

export function InsuranceTimeline({
  subdivisionId,
  policies: initialPolicies,
  readOnly,
}: {
  subdivisionId: string;
  policies: InsurancePolicy[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [policies, setPolicies] = useState(initialPolicies);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<InsurancePolicy | null>(null);

  // Sort by start_date ascending
  const sorted = [...policies].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  // Build timeline with gaps
  type TimelineItem = { type: "covered" | "gap"; startDate: string; endDate: string; policy?: InsurancePolicy };
  const timeline: TimelineItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const policy = sorted[i];
    if (i > 0) {
      const prevEnd = new Date(sorted[i - 1].end_date);
      const thisStart = new Date(policy.start_date);
      prevEnd.setDate(prevEnd.getDate() + 1);
      if (prevEnd < thisStart) {
        timeline.push({ type: "gap", startDate: prevEnd.toISOString().split("T")[0], endDate: new Date(thisStart.getTime() - 86400000).toISOString().split("T")[0] });
      }
    }
    timeline.push({ type: "covered", startDate: policy.start_date, endDate: policy.end_date, policy });
  }

  if (sorted.length > 0) {
    const lastEnd = new Date(sorted[sorted.length - 1].end_date);
    const now = new Date();
    lastEnd.setDate(lastEnd.getDate() + 1);
    if (lastEnd < now) {
      timeline.push({ type: "gap", startDate: lastEnd.toISOString().split("T")[0], endDate: "now" });
    }
  }

  const displayTimeline = [...timeline].reverse();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Insurance</h1>
        {!readOnly && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add policy
          </Button>
        )}
      </div>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No insurance policies</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {readOnly ? "No insurance policies have been added yet." : "Add your first insurance policy to track coverage and get expiry alerts."}
            </p>
            {!readOnly && (
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add policy
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0">
          {displayTimeline.map((entry, i) => {
            if (entry.type === "gap") {
              return (
                <div key={`gap-${i}`} className="flex items-stretch">
                  <div className="w-24 shrink-0 pr-3 py-2 text-right">
                    <p className="text-xs text-destructive">{formatDateLong(entry.startDate)}</p>
                  </div>
                  <div className="flex flex-col items-center px-3">
                    <div className="h-3 w-3 rounded-full bg-destructive shrink-0" />
                    <div className="w-0.5 flex-1 bg-destructive/20" />
                  </div>
                  <div className="flex-1 py-1.5 pb-3">
                    <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                      <ShieldX className="h-3.5 w-3.5 text-destructive shrink-0" />
                      <span className="text-sm text-destructive">No coverage</span>
                    </div>
                  </div>
                </div>
              );
            }

            const policy = entry.policy!;
            const isExpired = new Date(policy.end_date) < new Date();
            const isExpiringSoon = !isExpired && new Date(policy.end_date) < new Date(Date.now() + 30 * 86400000);

            return (
              <div key={policy.id} className="flex items-stretch">
                <div className="w-24 shrink-0 pr-3 py-2 text-right">
                  <p className="text-xs text-muted-foreground">{formatDateLong(policy.start_date)}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{formatDateLong(policy.end_date)}</p>
                </div>
                <div className="flex flex-col items-center px-3">
                  <div className={`h-3 w-3 rounded-full shrink-0 ${isExpired ? "bg-muted-foreground" : isExpiringSoon ? "bg-warning" : "bg-[hsl(160,100%,37%)]"}`} />
                  <div className="w-0.5 flex-1 bg-border" />
                </div>
                <div className="flex-1 py-1.5 pb-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPolicy(policy)}
                    className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2.5 text-left hover:border-primary/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{POLICY_LABELS[policy.policy_type] ?? policy.policy_type}</span>
                      {isExpiringSoon && <Badge variant="warning">Expiring soon</Badge>}
                      {isExpired && <Badge variant="neutral">Expired</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      {policy.premium && <span className="text-sm tabular-nums text-muted-foreground">{formatCurrency(Number(policy.premium))}</span>}
                      {policy.document_url && (
                        <a
                          href={policy.document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <AddPolicyDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          subdivisionId={subdivisionId}
          onCreated={async () => {
            const updated = await getInsurancePolicies(subdivisionId);
            setPolicies(updated);
          }}
        />
      )}

      <PolicyDetailDialog
        policy={selectedPolicy}
        open={!!selectedPolicy}
        onClose={() => setSelectedPolicy(null)}
      />
    </div>
  );
}
