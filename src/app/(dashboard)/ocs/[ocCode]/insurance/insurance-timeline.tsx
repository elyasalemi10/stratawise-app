"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShieldAlert, ShieldX, Download, CalendarIcon, Loader2, X, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { uploadAndParseInsuranceCoc } from "./parse-coc";
import { formatDateLong } from "@/lib/utils";
import {
  createInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
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
// Thin wrapper around NumberInput so every $ field in this file
// gets the consistent "$" prefix + thousands separators per the
// CLAUDE.md amount-input rule.

function AmountInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      thousandsSeparator
      prefix="$"
      placeholder={placeholder}
      allowDecimal
    />
  );
}

// ─── Policy Detail Dialog ──────────────────────────────────

function PolicyDetailDialog({
  policy, open, onClose, readOnly, ocId, onUpdated,
}: {
  policy: InsurancePolicy | null; open: boolean; onClose: () => void;
  readOnly?: boolean; ocId: string; onUpdated: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editProvider, setEditProvider] = useState("");
  const [editPolicyNum, setEditPolicyNum] = useState("");
  const [editSumInsured, setEditSumInsured] = useState("");
  const [editPremium, setEditPremium] = useState("");
  const [saving, setSaving] = useState(false);
  const [editStartDate, setEditStartDate] = useState<Date | undefined>(undefined);
  const [editEndDate, setEditEndDate] = useState<Date | undefined>(undefined);
  const [editStartOpen, setEditStartOpen] = useState(false);
  const [editEndOpen, setEditEndOpen] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocName, setUploadDocName] = useState("");

  async function handleReplaceDocument(file: File) {
    if (!policy) return;
    setUploadDocName(file.name);
    setUploadingDoc(true);

    // Upload new file
    const formData = new FormData();
    formData.append("file", file);
    formData.append("oc_id", ocId);
    formData.append("category", "insurance");
    const uploadRes = await fetch("/api/documents", { method: "POST", body: formData });

    if (!uploadRes.ok) {
      toast.error("Failed to upload document");
      setUploadingDoc(false);
      setUploadDocName("");
      return;
    }

    const uploadData = await uploadRes.json();
    const newUrl = uploadData.public_url;

    // Delete old document from R2 if it exists
    if (policy.document_url && uploadData.id) {
      // The old doc may have been uploaded via a different mechanism,
      // but the new one is tracked in the documents table
    }

    // Update policy with new document URL
    const result = await updateInsurancePolicy(ocId, policy.id, {
      document_url: newUrl,
    });

    setUploadingDoc(false);
    setUploadDocName("");

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Certificate of currency updated");
      onUpdated();
      onClose();
    }
  }

  if (!policy) return null;
  const isExpired = new Date(policy.end_date) < new Date();
  const isExpiringSoon = !isExpired && new Date(policy.end_date) < new Date(Date.now() + 30 * 86400000);

  function startEdit() {
    setEditProvider(policy!.provider);
    setEditPolicyNum(policy!.policy_number ?? "");
    setEditSumInsured(policy!.sum_insured ? String(policy!.sum_insured) : "");
    setEditPremium(policy!.premium ? String(policy!.premium) : "");
    setEditStartDate(new Date(policy!.start_date + "T00:00:00"));
    setEditEndDate(new Date(policy!.end_date + "T00:00:00"));
    setEditing(true);
  }

  async function handleSave() {
    if (editStartDate && editEndDate && editEndDate <= editStartDate) {
      toast.error("End date must be after start date");
      return;
    }
    setSaving(true);
    const result = await updateInsurancePolicy(ocId, policy!.id, {
      provider: editProvider,
      policy_number: editPolicyNum,
      sum_insured: editSumInsured ? Number(editSumInsured) : undefined,
      premium: editPremium ? Number(editPremium) : undefined,
      ...(editStartDate ? { start_date: format(editStartDate, "yyyy-MM-dd") } : {}),
      ...(editEndDate ? { end_date: format(editEndDate, "yyyy-MM-dd") } : {}),
    });
    setSaving(false);
    if (result.error) { toast.error(result.error); }
    else { toast.success("Policy updated"); setEditing(false); onUpdated(); onClose(); }
  }

  async function handleDelete() {
    if (!confirm("Delete this insurance policy? This cannot be undone.")) return;
    setDeleting(true);
    const result = await deleteInsurancePolicy(ocId, policy!.id);
    setDeleting(false);
    if (result.error) { toast.error(result.error); }
    else { toast.success("Policy deleted"); onUpdated(); onClose(); }
  }

  return (
    <Dialog open={open} onOpenChange={() => { setEditing(false); onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{POLICY_LABELS[policy.policy_type] ?? policy.policy_type} insurance</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Input value={editProvider} onChange={(e) => setEditProvider(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Policy number</Label>
              <Input value={editPolicyNum} onChange={(e) => setEditPolicyNum(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start date</Label>
                <Popover open={editStartOpen} onOpenChange={setEditStartOpen}>
                  <PopoverTrigger className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                    <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    {editStartDate ? format(editStartDate, "d MMM yyyy") : "Select"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start" side="bottom">
                    <Calendar mode="single" selected={editStartDate} onSelect={(d) => { setEditStartDate(d); if (d && editEndDate && editEndDate <= d) setEditEndDate(undefined); setEditStartOpen(false); }} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End date</Label>
                <Popover open={editEndOpen} onOpenChange={setEditEndOpen}>
                  <PopoverTrigger className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm cursor-pointer">
                    <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    {editEndDate ? format(editEndDate, "d MMM yyyy") : "Select"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start" side="bottom">
                    <Calendar mode="single" selected={editEndDate} onSelect={(d) => { setEditEndDate(d); setEditEndOpen(false); }} disabled={editStartDate ? { before: new Date(editStartDate.getTime() + 86400000) } : undefined} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Sum insured</Label>
                <AmountInput value={editSumInsured} onChange={setEditSumInsured} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Premium</Label>
                <AmountInput value={editPremium} onChange={setEditPremium} placeholder="0.00" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(false)} className="cursor-pointer">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="cursor-pointer">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
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
                <span className="text-sm text-foreground">{formatDateLong(policy.start_date)} , {formatDateLong(policy.end_date)}</span>
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
                {/* Route via /api/insurance-docs/[id] for an authorised
                    302 to a 15-min presigned R2 URL , the raw
                    policy.document_url is a public R2 link we no longer
                    expose directly. */}
                <a
                  href={`/api/insurance-docs/${policy.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="default" className="w-full cursor-pointer">
                    <Download className="mr-2 h-4 w-4" />
                    Download certificate of currency
                  </Button>
                </a>
              </div>
            )}
            {!readOnly && (
              <div className="border-t border-border pt-4 mt-2 space-y-3">
                {/* Replace certificate */}
                <div>
                  {uploadingDoc ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate flex-1">{uploadDocName}</span>
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 cursor-pointer">
                      <Plus className="h-3.5 w-3.5" />
                      {policy.document_url ? "Replace certificate of currency" : "Upload certificate of currency"}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceDocument(f); }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
                {/* Edit / Delete */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={startEdit} className="cursor-pointer">
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="cursor-pointer text-destructive hover:text-destructive">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Policy Drawer ─────────────────────────────────────
//
// Right-side sheet with a two-step flow:
//   Step 1 "coc" , drop the Certificate of Currency PDF; we run Gemini
//                  + Document AI to extract provider / number / sum
//                  insured / premium / coverage dates. Manager can also
//                  skip and enter manually.
//   Step 2 "form" , fields, prefilled from the parse result when a CoC
//                   was uploaded. Manager reviews + saves.

function AddPolicyDrawer({
  open,
  onClose,
  ocId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  ocId: string;
  onCreated: () => void;
}) {
  // Step "psMismatch": shown when the uploaded CoC's PS number doesn't
  // match the OC's. Manager either confirms it's still the right cert
  // (continues to form) or backs out and re-uploads.
  const [step, setStep] = useState<"coc" | "psMismatch" | "form">("coc");
  const [parsing, setParsing] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [psMismatch, setPsMismatch] = useState<{ cert: string | null; oc: string | null } | null>(null);

  const [policyType, setPolicyType] = useState("building");
  const [policyTypeCustom, setPolicyTypeCustom] = useState("");
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [premium, setPremium] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [documentUrl, setDocumentUrl] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("coc");
    setParsing(false);
    setUploadName(null);
    setPsMismatch(null);
    setPolicyType("building");
    setPolicyTypeCustom("");
    setProvider("");
    setPolicyNumber("");
    setSumInsured("");
    setPremium("");
    setStartDate("");
    setEndDate("");
    setDocumentUrl(undefined);
  }

  async function handleCocUpload(file: File) {
    setUploadName(file.name);
    setParsing(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadAndParseInsuranceCoc(ocId, fd);
    setParsing(false);
    if (res.error) {
      toast.error(res.error);
      setUploadName(null);
      return;
    }
    setDocumentUrl(res.public_url);
    // Prefill from the first policy in the CoC. Multi-policy CoCs (a
    // building + public liability bundle, etc.) currently get the first
    // section; the manager can edit before save, and add the others in
    // separate runs.
    const first = res.policies?.[0];
    if (first) {
      // Map Gemini's policy_type to our select. "combined" + anything
      // we don't have a tile for falls into "other" with the raw value
      // pre-filled into the custom-type field so the manager can keep
      // or tweak it.
      const knownTypes = new Set(POLICY_TYPES.map((t) => t.value));
      const incomingType = first.policy_type ?? "other";
      if (knownTypes.has(incomingType) && incomingType !== "other") {
        setPolicyType(incomingType);
      } else {
        setPolicyType("other");
        setPolicyTypeCustom(incomingType === "other" ? "" : incomingType);
      }
      setProvider(first.provider ?? "");
      setPolicyNumber(first.policy_number ?? "");
      if (first.sum_insured !== null && first.sum_insured !== undefined) {
        setSumInsured(String(first.sum_insured));
      }
      if (first.premium !== null && first.premium !== undefined) {
        setPremium(String(first.premium));
      }
      if (first.start_date) setStartDate(first.start_date);
      if (first.end_date) setEndDate(first.end_date);
      toast.success("We pre-filled the form from your certificate.");
    } else {
      toast.info("Certificate uploaded. We couldn't extract policy fields, fill them in manually.");
    }
    // PS-number mismatch → ask to confirm BEFORE moving to the form.
    if (res.ps_match === false) {
      setPsMismatch({ cert: res.plan_number ?? null, oc: null });
      setStep("psMismatch");
      return;
    }
    setStep("form");
  }

  async function handleSubmit() {
    const resolvedType =
      policyType === "other" ? (policyTypeCustom.trim() || "other") : policyType;
    if (!provider || !startDate || !endDate) {
      toast.error("Provider and coverage dates are required.");
      return;
    }
    if (policyType === "other" && !policyTypeCustom.trim()) {
      toast.error("Name the custom policy type.");
      return;
    }
    if (endDate <= startDate) {
      toast.error("End date must be after start date.");
      return;
    }
    setPending(true);
    const result = await createInsurancePolicy(ocId, {
      policy_type: resolvedType,
      provider,
      policy_number: policyNumber || undefined,
      sum_insured: sumInsured ? Number(sumInsured) : undefined,
      premium: premium ? Number(premium) : undefined,
      start_date: startDate,
      end_date: endDate,
      document_url: documentUrl,
    });
    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    toast.success("Insurance policy added");
    onCreated();
    reset();
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o && !pending && !parsing) { reset(); onClose(); } }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add insurance policy</SheetTitle>
          <SheetDescription className="sr-only">
            Upload a certificate of currency to prefill, or enter the policy details manually.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {step === "coc" && (
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                Drop your Certificate of Currency PDF here. We&apos;ll read the provider, policy number, sum insured, premium, and coverage dates and pre-fill the next page.
              </p>
              <label
                className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-card px-4 py-12 text-center transition-colors hover:border-primary/40 hover:bg-muted/40 ${parsing ? "pointer-events-none opacity-70" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleCocUpload(f);
                }}
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="mt-3 text-sm text-muted-foreground">Reading {uploadName}...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-8 w-8 text-muted-foreground" />
                    <span className="mt-3 text-sm text-foreground">Drop your certificate here, or click to choose</span>
                    <span className="mt-1 text-xs text-muted-foreground">PDF, up to 25 MB</span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCocUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}

          {step === "psMismatch" && (
            <div className="space-y-4">
              <div className="rounded-md border border-warning/40 bg-warning/10 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  The plan number on this certificate doesn&apos;t match this OC.
                </p>
                <p className="text-sm text-muted-foreground">
                  Certificate says <span className="font-medium text-foreground">{psMismatch?.cert ?? "(none found)"}</span>.
                  If you&apos;re sure this is the right certificate for this OC, confirm to continue. Otherwise upload a different file.
                </p>
              </div>
            </div>
          )}

          {step === "form" && (
            <div className={`space-y-4 ${pending ? "pointer-events-none opacity-90" : ""}`}>
              <div className="space-y-1.5">
                <Label>Policy type</Label>
                <Select value={policyType} onValueChange={(v) => setPolicyType(v ?? "building")}>
                  <SelectTrigger>
                    <SelectValue>
                      {POLICY_LABELS[policyType] ?? policyType}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {policyType === "other" && (
                <div className="space-y-1.5">
                  <Label>Custom policy type <span className="text-destructive">*</span></Label>
                  <Input
                    value={policyTypeCustom}
                    onChange={(e) => setPolicyTypeCustom(e.target.value)}
                    placeholder="Policy type"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Provider <span className="text-destructive">*</span></Label>
                <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Insurer name" />
              </div>
              <div className="space-y-1.5">
                <Label>Policy number</Label>
                <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Policy number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start date <span className="text-destructive">*</span></Label>
                  <DatePicker value={startDate} onChange={setStartDate} />
                </div>
                <div className="space-y-1.5">
                  <Label>End date <span className="text-destructive">*</span></Label>
                  <DatePicker value={endDate} onChange={setEndDate} minDate={startDate || undefined} />
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
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-2">
          {step === "coc" && (
            <Button variant="secondary" onClick={() => setStep("form")} disabled={parsing}>
              Skip and enter manually
            </Button>
          )}
          {step === "psMismatch" && (
            <>
              <Button variant="secondary" onClick={() => setStep("coc")} disabled={pending}>
                Upload different file
              </Button>
              <Button onClick={() => setStep("form")} disabled={pending}>
                Yes, use this certificate
              </Button>
            </>
          )}
          {step === "form" && (
            <>
              <Button variant="secondary" onClick={() => setStep("coc")} disabled={pending}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={pending || !provider || !startDate || !endDate}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Add policy
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Component ────────────────────────────────────────

export function InsuranceTimeline({
  ocId,
  policies: initialPolicies,
  readOnly,
}: {
  ocId: string;
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
      {!readOnly && policies.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add policy
          </Button>
        </div>
      )}

      {policies.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No insurance policies"
          description={readOnly ? "No insurance policies have been added yet." : "Add your first insurance policy to track coverage and get expiry alerts."}
          action={
            !readOnly ? (
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add policy
              </Button>
            ) : undefined
          }
        />
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
                          href={`/api/insurance-docs/${policy.id}`}
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
        <AddPolicyDrawer
          open={showAdd}
          onClose={() => setShowAdd(false)}
          ocId={ocId}
          onCreated={async () => {
            const updated = await getInsurancePolicies(ocId);
            setPolicies(updated);
          }}
        />
      )}

      <PolicyDetailDialog
        policy={selectedPolicy}
        open={!!selectedPolicy}
        onClose={() => setSelectedPolicy(null)}
        readOnly={readOnly}
        ocId={ocId}
        onUpdated={async () => {
          const updated = await getInsurancePolicies(ocId);
          setPolicies(updated);
        }}
      />
    </div>
  );
}
