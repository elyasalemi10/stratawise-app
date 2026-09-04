"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarIcon, CheckCircle2, Download, FileCheck, Loader2, Pencil, Plus, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateLong, cn } from "@/lib/utils";
import { uploadAndParseInsuranceCoc, attachDocumentToPolicy } from "./parse-coc";
import {
  PAYMENT_FREQUENCY_LABEL,
  PAYMENT_FREQUENCY_OPTIONS,
  type InsurancePolicy,
  type PaymentFrequency,
} from "@/lib/insurance-shared";
import {
  createInsurancePolicy,
  deleteInsurancePolicy,
  getInsurancePolicies,
  updateInsurancePolicy,
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
  const [editBroker, setEditBroker] = useState("");
  const [editExcess, setEditExcess] = useState("");
  const [editFrequency, setEditFrequency] = useState<PaymentFrequency>("annual");
  const [editCocExpiry, setEditCocExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [editStartDate, setEditStartDate] = useState<Date | undefined>(undefined);
  const [editEndDate, setEditEndDate] = useState<Date | undefined>(undefined);
  const [editStartOpen, setEditStartOpen] = useState(false);
  const [editEndOpen, setEditEndOpen] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [openedAt] = useState(() => Date.now());
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
  // Captured once, not read on every render. Expiry is a day-level judgement
  // and a clock that ticks mid-render can flip the badge between two renders
  // of the same dialog.
  const isExpired = new Date(policy.end_date) < new Date(openedAt);
  const isExpiringSoon =
    !isExpired && new Date(policy.end_date) < new Date(openedAt + 30 * 86400000);

  function startEdit() {
    setEditProvider(policy!.provider);
    setEditPolicyNum(policy!.policy_number ?? "");
    setEditBroker(policy!.broker ?? "");
    setEditSumInsured(policy!.sum_insured ? String(policy!.sum_insured) : "");
    setEditPremium(policy!.premium ? String(policy!.premium) : "");
    setEditExcess(policy!.excess ? String(policy!.excess) : "");
    setEditFrequency(policy!.payment_frequency ?? "annual");
    setEditCocExpiry(policy!.certificate_of_currency_expiry ?? "");
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
      broker: editBroker,
      sum_insured: editSumInsured ? Number(editSumInsured) : undefined,
      premium: editPremium ? Number(editPremium) : undefined,
      excess: editExcess ? Number(editExcess) : undefined,
      payment_frequency: editFrequency,
      certificate_of_currency_expiry: editCocExpiry || null,
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
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{POLICY_LABELS[policy.policy_type] ?? policy.policy_type} insurance</SheetTitle>
          <SheetDescription className="sr-only">Policy details</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">

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
                <AmountInput value={editSumInsured} onChange={setEditSumInsured} placeholder="Sum insured" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Premium</Label>
                <AmountInput value={editPremium} onChange={setEditPremium} placeholder="Premium" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Excess</Label>
                <AmountInput value={editExcess} onChange={setEditExcess} placeholder="Excess" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Premium paid</Label>
                <Select
                  value={editFrequency}
                  onValueChange={(v) => setEditFrequency(v as PaymentFrequency)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{PAYMENT_FREQUENCY_LABEL[editFrequency]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_FREQUENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Broker</Label>
                <Input value={editBroker} onChange={(e) => setEditBroker(e.target.value)} placeholder="Broker" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Certificate expires</Label>
                <DatePicker value={editCocExpiry} onChange={setEditCocExpiry} placeholder="Certificate expiry" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(false)} className="cursor-pointer">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="cursor-pointer" loading={saving}>
                Save
              </Button>
            </div>
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
                  <span className="text-sm text-foreground">
                    {formatCurrency(Number(policy.premium))}
                    <span className="text-muted-foreground">
                      {" "}{PAYMENT_FREQUENCY_LABEL[policy.payment_frequency ?? "annual"].toLowerCase()}
                    </span>
                  </span>
                </div>
              )}
              {policy.excess ? (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Excess</span>
                  <span className="text-sm text-foreground">{formatCurrency(Number(policy.excess))}</span>
                </div>
              ) : null}
              {policy.broker && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Broker</span>
                  <span className="text-sm text-foreground">{policy.broker}</span>
                </div>
              )}
              {policy.certificate_of_currency_expiry && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Certificate expires</span>
                  <span className="text-sm text-foreground">
                    {formatDateLong(policy.certificate_of_currency_expiry)}
                  </span>
                </div>
              )}
            </div>
            {/* Download / Upload + Replace control. Order: when the
                policy has a CoC, show the Download button big +
                "Replace?" inline beneath it. When it doesn't (manager
                entered fields manually), show only the Upload button
                so no broken "download" appears for a non-existent
                file. */}
            {policy.document_url ? (
              <div className="border-t border-border pt-4 mt-2 space-y-1.5">
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
                {!readOnly && (
                  <div className="text-left">
                    {uploadingDoc ? (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Replacing {uploadDocName}...
                      </span>
                    ) : (
                      <label className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand-gold)] hover:underline cursor-pointer">
                        Replace?
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceDocument(f); }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ) : !readOnly ? (
              <div className="border-t border-border pt-4 mt-2">
                {uploadingDoc ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="truncate text-foreground">{uploadDocName}</span>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/40 cursor-pointer">
                    <Plus className="h-3.5 w-3.5" />
                    Upload certificate of currency
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceDocument(f); }}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            ) : null}

            {!readOnly && (
              <div className="border-t border-border pt-4 mt-2 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startEdit} className="cursor-pointer">
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="cursor-pointer text-destructive hover:text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            )}
          </>
        )}
        </div>
      </SheetContent>
    </Sheet>
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
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>("annual");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [documentUrl, setDocumentUrl] = useState<string | undefined>(undefined);
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  // Per-field invalid flags. Set only on submit, cleared on change, so
  // nothing turns red while the manager is still typing.
  const [providerInvalid, setProviderInvalid] = useState(false);
  const [startInvalid, setStartInvalid] = useState(false);
  const [endInvalid, setEndInvalid] = useState(false);
  const [customTypeInvalid, setCustomTypeInvalid] = useState(false);
  const [certificateInvalid, setCertificateInvalid] = useState(false);
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
    setDocumentId(undefined);
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
    setDocumentId(res.document_id);
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
    // Collect every problem before saying anything, so the manager fixes
    // the form once rather than being told about one field at a time.
    const problems: string[] = [];
    if (!provider.trim()) problems.push("Insurer is required.");
    if (!startDate) problems.push("Start date is required.");
    if (!endDate) problems.push("End date is required.");
    if (policyType === "other" && !policyTypeCustom.trim()) {
      problems.push("Name the custom policy type.");
    }
    if (startDate && endDate && endDate <= startDate) {
      problems.push("End date must be after start date.");
    }
    // The certificate of currency is the whole point of the record. It is
    // what an owner, a lender or a conveyancer asks for, and a policy on
    // file without one cannot answer the question it exists to answer, so
    // it is required whether the manager uploaded it up front or skipped
    // ahead to type the details.
    if (!documentId && !documentUrl) {
      problems.push("A certificate of currency is required.");
    }
    setProviderInvalid(!provider.trim());
    setStartInvalid(!startDate || (!!endDate && endDate <= startDate));
    setEndInvalid(!endDate || (!!startDate && endDate <= startDate));
    setCustomTypeInvalid(policyType === "other" && !policyTypeCustom.trim());
    setCertificateInvalid(!documentId && !documentUrl);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }
    setPending(true);
    const result = await createInsurancePolicy(ocId, {
      policy_type: resolvedType,
      provider,
      policy_number: policyNumber || undefined,
      sum_insured: sumInsured ? Number(sumInsured) : undefined,
      premium: premium ? Number(premium) : undefined,
      payment_frequency: paymentFrequency,
      start_date: startDate,
      end_date: endDate,
      document_url: documentUrl,
      certificate_of_currency_document_id: documentId,
    });
    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    // Back-link the uploaded CoC document (if any) to the freshly
    // created policy so the policy detail page can show "Source: <file>"
    // and the documents page can filter by policy. Best-effort: a
    // failure here doesn't undo the policy , the manager can re-attach
    // from the docs page.
    if (documentId && result.policyId) {
      void attachDocumentToPolicy(ocId, documentId, result.policyId);
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
            Upload the certificate of currency to prefill the policy details, or enter them manually.
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
              {/* The certificate is required, so it belongs in the form as a
                  field rather than only as the step the manager may have
                  skipped past. Attached: say so. Not attached: it is the
                  field the submit-time error points at. */}
              <div className="space-y-1.5">
                <Label>
                  Certificate of currency <span className="text-destructive">*</span>
                </Label>
                {documentId || documentUrl ? (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {uploadName ?? "Certificate attached"}
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => setStep("coc")}>
                      Replace
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep("coc")}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-4 text-sm transition-colors",
                      certificateInvalid
                        ? "border-destructive text-destructive"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/40",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Upload the certificate of currency
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Policy type</Label>
                <Select value={policyType} onValueChange={(v) => setPolicyType(v ?? "building")}>
                  <SelectTrigger>
                    <SelectValue>
                      {POLICY_LABELS[policyType] ?? policyType}
                    </SelectValue>
                  </SelectTrigger>
                  {/* alignItemWithTrigger=false stops base-ui from
                      aligning the selected item with the trigger , which
                      was forcing the popup to open UPWARD inside the
                      drawer. Default side="bottom" still applies. */}
                  <SelectContent alignItemWithTrigger={false}>
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
                    onChange={(e) => { setPolicyTypeCustom(e.target.value); if (customTypeInvalid) setCustomTypeInvalid(false); }}
                    aria-invalid={customTypeInvalid || undefined}
                    placeholder="Policy type"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Insurer <span className="text-destructive">*</span></Label>
                <Input
                  value={provider}
                  onChange={(e) => { setProvider(e.target.value); if (providerInvalid) setProviderInvalid(false); }}
                  aria-invalid={providerInvalid || undefined}
                  placeholder="Insurer name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Policy number</Label>
                <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Policy number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start date <span className="text-destructive">*</span></Label>
                  <DatePicker
                    value={startDate}
                    onChange={(v) => { setStartDate(v); if (startInvalid) setStartInvalid(false); }}
                    invalid={startInvalid}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End date <span className="text-destructive">*</span></Label>
                  <DatePicker
                    value={endDate}
                    onChange={(v) => { setEndDate(v); if (endInvalid) setEndInvalid(false); }}
                    invalid={endInvalid}
                    minDate={startDate || undefined}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Sum insured</Label>
                  <AmountInput value={sumInsured} onChange={setSumInsured} placeholder="Sum insured" />
                </div>
                <div className="space-y-1.5">
                  <Label>Premium paid</Label>
                  <Select
                    value={paymentFrequency}
                    onValueChange={(v) => setPaymentFrequency((v as PaymentFrequency) ?? "annual")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{PAYMENT_FREQUENCY_LABEL[paymentFrequency]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {PAYMENT_FREQUENCY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                {/* The label carries the period, so the number is never
                    ambiguous: "Premium" alone next to a monthly policy is
                    the kind of field that gets budgeted twelve times too
                    small. */}
                <Label>
                  {paymentFrequency === "annual"
                    ? "Premium a year"
                    : paymentFrequency === "semi_annual"
                      ? "Premium every six months"
                      : paymentFrequency === "quarterly"
                        ? "Premium a quarter"
                        : "Premium a month"}
                </Label>
                <AmountInput value={premium} onChange={setPremium} placeholder="Premium" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-2">
          {step === "coc" && (
            <Button variant="secondary" onClick={() => setStep("form")} disabled={parsing}>
              Enter details manually
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
              <Button
                onClick={handleSubmit}
                disabled={pending || !provider || !startDate || !endDate || (!documentId && !documentUrl)}
                loading={pending}
              >
                Add policy
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Insurance Gantt ───────────────────────────────────────
// Horizontal scrollable timeline with one row per policy_type group.
// Each policy renders as a positioned bar coloured by its current
// expiry state. A red/white striped band sits in the background of
// every row to make "no cover" gaps obvious at a glance.
//
// Time axis spans from earliest(managementStartDate, oldest policy
// start) to latest(today + 60d, latest policy end). One pixel ≈ one
// day; the inner track is set to max(1200, dayCount * 4) so short
// histories still render generously and long ones scroll.

function InsuranceGantt({
  policies,
  managementStartDate,
  fyStartMonth = 7,
  onPolicyClick,
}: {
  policies: InsurancePolicy[];
  managementStartDate: string | null;
  /** OC's financial year start month (1-12). Defaults to July (AU
   *  standard). Axis ticks render on the FY-quarter starts: this
   *  month, +3, +6, +9. */
  fyStartMonth?: number;
  onPolicyClick: (p: InsurancePolicy) => void;
}) {
  const [hovered, setHovered] = useState<{ policy: InsurancePolicy; x: number; y: number } | null>(null);

  // Bucket policies by their type. We render a row for EVERY known
  // policy type (even when empty) so the gantt is a complete picture
  // of "what insurance the OC should have vs does have". Empty rows
  // make missing categories visually obvious through the red/white
  // no-cover band.
  const groups = new Map<string, InsurancePolicy[]>();
  for (const t of POLICY_TYPES) groups.set(t.value, []);
  for (const p of policies) {
    if (!groups.has(p.policy_type)) groups.set(p.policy_type, []);
    groups.get(p.policy_type)!.push(p);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const policyStarts = policies.map((p) => new Date(p.start_date).getTime());
  const policyEnds = policies.map((p) => new Date(p.end_date).getTime());
  const mgmtStartMs = managementStartDate
    ? new Date(`${managementStartDate}T00:00:00`).getTime()
    : Infinity;
  const minMs = Math.min(mgmtStartMs, ...policyStarts);
  const sixtyDaysOut = today.getTime() + 60 * 86400000;
  const maxMs = Math.max(sixtyDaysOut, ...policyEnds);
  const totalDays = Math.max(1, Math.round((maxMs - minMs) / 86400000));
  // Zoomed out: ~2.5 px per day so years compress nicely on screen.
  // Min track width keeps the axis readable on short histories.
  const trackWidth = Math.max(900, totalDays * 2.5);
  const pxPerDay = trackWidth / totalDays;

  function offsetPx(iso: string): number {
    const ms = new Date(`${iso}T00:00:00`).getTime();
    return ((ms - minMs) / 86400000) * pxPerDay;
  }
  function widthPx(start: string, end: string): number {
    const days = Math.max(1, (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000);
    return Math.max(4, days * pxPerDay);
  }

  // Quarter ticks only , the FY's four quarter starts. For FY July
  // that's Jul / Oct / Jan / Apr; for FY January it's Jan / Apr / Jul
  // / Oct. Walk by 3-month steps from the most recent FY-quarter
  // boundary before minMs.
  const ticks: Array<{ iso: string; label: string }> = [];
  const fyStartIdx = Math.max(0, Math.min(11, fyStartMonth - 1));
  const tickWalker = new Date(minMs);
  tickWalker.setDate(1);
  // Snap walker back to the previous quarter boundary so the leftmost
  // tick is always at a quarter start, never mid-quarter.
  const monthOffsetFromFy = ((tickWalker.getMonth() - fyStartIdx) % 3 + 3) % 3;
  tickWalker.setMonth(tickWalker.getMonth() - monthOffsetFromFy);
  while (tickWalker.getTime() <= maxMs) {
    ticks.push({
      iso: tickWalker.toISOString().slice(0, 10),
      label: tickWalker.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
    });
    tickWalker.setMonth(tickWalker.getMonth() + 3);
  }

  const todayPx = ((today.getTime() - minMs) / 86400000) * pxPerDay;
  const ROW_H = 90; // generous so policy bars + label read in one glance

  return (
    <div className="relative rounded-md border border-border bg-card">
      {/* Horizontal-scrolling timeline. No sticky left labels , policy
          rows are unlabelled bars laid out along a shared time axis. */}
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="relative" style={{ width: trackWidth, minWidth: "100%" }}>
          {/* Time axis , FY quarter ticks along the top of the timeline. */}
          <div className="border-b border-border bg-card">
            <div className="relative h-9 bg-card" style={{ width: trackWidth }}>
              {ticks.map((t) => (
                <div
                  key={t.iso}
                  className="absolute top-0 bottom-0 flex flex-col items-start"
                  style={{ left: offsetPx(t.iso) }}
                >
                  <span className="text-[10px] text-muted-foreground pl-1 pt-1 whitespace-nowrap">{t.label}</span>
                  <div className="w-px flex-1 bg-border mt-auto" />
                </div>
              ))}
              {todayPx >= 0 && todayPx <= trackWidth && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-primary"
                  style={{ left: todayPx }}
                >
                  <span className="absolute -top-3 left-1 text-[10px] font-medium text-primary whitespace-nowrap">Today</span>
                </div>
              )}
            </div>
          </div>

          {Array.from(groups.entries()).map(([typeKey, group]) => (
            <div key={typeKey} className="border-b border-border/50 last:border-b-0">
              <div
                className="relative"
                style={{
                  width: trackWidth,
                  height: ROW_H,
                  backgroundImage:
                    "repeating-linear-gradient(45deg, hsl(0, 72%, 92%) 0 8px, hsl(0, 0%, 100%) 8px 16px)",
                }}
              >
                {group.map((p) => {
                  const isExpired = new Date(p.end_date) < today;
                  const isExpiringSoon = !isExpired && new Date(p.end_date) < new Date(today.getTime() + 30 * 86400000);
                  const bg = isExpired
                    ? "bg-muted-foreground/30 border-muted-foreground/40 text-muted-foreground"
                    : isExpiringSoon
                    ? "bg-warning/30 border-warning text-foreground"
                    : "bg-[hsl(160,100%,90%)] border-[hsl(160,100%,37%)] text-foreground";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPolicyClick(p)}
                      onMouseEnter={(e) => setHovered({ policy: p, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHovered({ policy: p, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        "absolute top-4 bottom-4 rounded-md border px-2 text-left text-xs flex items-center gap-1 overflow-hidden hover:ring-2 hover:ring-primary/30 transition-shadow cursor-pointer",
                        bg,
                      )}
                      style={{
                        left: offsetPx(p.start_date),
                        width: widthPx(p.start_date, p.end_date),
                      }}
                    >
                      <span className="truncate font-medium">{POLICY_LABELS[typeKey] ?? typeKey}: {p.provider}</span>
                      {p.premium && (
                        <span className="ml-auto shrink-0 tabular-nums opacity-80">{formatCurrency(Number(p.premium))}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-card shadow-lg px-3 py-2 text-xs text-foreground"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          <div className="font-medium">
            {hovered.policy.provider}
            {hovered.policy.policy_number ? `: ${hovered.policy.policy_number}` : ""}
          </div>
          <div className="mt-2 text-muted-foreground">
            {formatDateLong(hovered.policy.start_date)} - {formatDateLong(hovered.policy.end_date)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cover summary ─────────────────────────────────────────
// What a manager opens this page to find out, in the order they ask it:
// are we covered, when does that stop, and what is it costing. The gantt
// answered none of those , it plots WHEN, which is the fourth question.

interface CoverSummary {
  active: InsurancePolicy[];
  expiringSoon: InsurancePolicy[];
  expired: InsurancePolicy[];
  nextRenewal: InsurancePolicy | null;
  annualPremium: number;
  certificatesMissing: number;
}

/** Annualised so policies on different billing cycles can be added up. A
 *  monthly premium next to an annual one is not a total. */
const PERIODS_PER_YEAR: Record<PaymentFrequency, number> = {
  annual: 1,
  semi_annual: 2,
  quarterly: 4,
  monthly: 12,
};

function summarise(policies: InsurancePolicy[], now: number): CoverSummary {
  const soon = now + 30 * 86400000;
  const active: InsurancePolicy[] = [];
  const expiringSoon: InsurancePolicy[] = [];
  const expired: InsurancePolicy[] = [];
  let annualPremium = 0;
  let certificatesMissing = 0;

  for (const p of policies) {
    const end = new Date(p.end_date + "T00:00:00").getTime();
    if (end < now) expired.push(p);
    else if (end < soon) expiringSoon.push(p);
    else active.push(p);

    if (end >= now && p.premium) {
      annualPremium += Number(p.premium) * PERIODS_PER_YEAR[p.payment_frequency ?? "annual"];
    }
    if (end >= now && !p.certificate_of_currency_document_id && !p.document_url) {
      certificatesMissing += 1;
    }
  }

  const live = [...active, ...expiringSoon].sort(
    (a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime(),
  );
  return {
    active,
    expiringSoon,
    expired,
    nextRenewal: live[0] ?? null,
    annualPremium,
    certificatesMissing,
  };
}

function daysUntil(dateIso: string, now: number): number {
  return Math.ceil((new Date(dateIso + "T00:00:00").getTime() - now) / 86400000);
}

function SummaryCard({
  label,
  value,
  icon,
  tone = "default",
  detail,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "warning" | "destructive" | "success";
  detail?: string;
}) {
  const toneClass =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "bg-warning/10 text-warning"
        : tone === "success"
          ? "bg-success/10 text-success"
          : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-bold tabular-nums text-foreground">{value}</p>
            {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
          </div>
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", toneClass)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Policy table ──────────────────────────────────────────
// The facts, in a table, because that is what they are. The gantt stays
// below for spotting a gap between one policy ending and the next starting,
// which a table genuinely cannot show.

function PolicyTable({
  policies,
  now,
  onSelect,
}: {
  policies: InsurancePolicy[];
  now: number;
  onSelect: (p: InsurancePolicy) => void;
}) {
  const sorted = [...policies].sort(
    (a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime(),
  );
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="overflow-x-auto">
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              <TableHead>Cover</TableHead>
              <TableHead>Insurer</TableHead>
              <TableHead className="text-right">Sum insured</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Certificate</TableHead>
              <TableHead className="w-28">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => {
              const days = daysUntil(p.end_date, now);
              const hasCert = Boolean(p.certificate_of_currency_document_id || p.document_url);
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => onSelect(p)}
                >
                  <TableCell className="font-medium text-foreground">
                    {POLICY_LABELS[p.policy_type] ?? p.policy_type}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {p.provider}
                    {p.broker && (
                      <span className="block text-xs text-muted-foreground">via {p.broker}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {p.sum_insured ? formatCurrency(Number(p.sum_insured)) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {p.premium ? (
                      <>
                        {formatCurrency(Number(p.premium))}
                        <span className="block text-xs text-muted-foreground">
                          {PAYMENT_FREQUENCY_LABEL[p.payment_frequency ?? "annual"]}
                        </span>
                      </>
                    ) : ""}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatDateLong(p.end_date)}
                    {days >= 0 && days <= 60 && (
                      <span className="block text-xs text-muted-foreground">
                        in {days} {days === 1 ? "day" : "days"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {hasCert ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        On file
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        Missing
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={days < 0 ? "destructive" : days <= 30 ? "warning" : "success"}
                    >
                      {days < 0 ? "Expired" : days <= 30 ? "Expiring soon" : "Active"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function InsuranceTimeline({
  ocId,
  policies: initialPolicies,
  readOnly,
  managementStartDate,
  fyStartMonth = 7,
}: {
  ocId: string;
  policies: InsurancePolicy[];
  readOnly?: boolean;
  /** ISO yyyy-mm-dd of when the current management agreement began.
   *  The gantt's time axis defaults to start here; a policy whose
   *  start_date is earlier overrides it (we expand the axis left). */
  managementStartDate?: string | null;
  /** OC's financial-year start month (1-12), drives the quarter tick
   *  positions on the gantt's time axis. */
  fyStartMonth?: number;
}) {
  const [policies, setPolicies] = useState(initialPolicies);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<InsurancePolicy | null>(null);

  // Captured once. Expiry is a day-level judgement and a clock read on every
  // render can flip a badge between two renders of the same page.
  const [now] = useState(() => Date.now());
  const summary = useMemo(() => summarise(policies, now), [policies, now]);

  async function reload() {
    setPolicies(await getInsurancePolicies(ocId));
  }

  // Nothing at all: one empty state with the action in it, rather than an
  // empty gantt with an "Add policy" button floating above it.
  if (policies.length === 0) {
    return (
      <>
        <EmptyState
          illustration="checklist"
          title="No insurance on record"
          description={
            readOnly
              ? "The manager has not added any policies for this Owners Corporation yet."
              : "Add the building policy to track its renewal, premium and certificate of currency."
          }
          action={
            readOnly ? undefined : (
              <Button onClick={() => setShowAdd(true)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add policy
              </Button>
            )
          }
        />
        {showAdd && (
          <AddPolicyDrawer
            open={showAdd}
            onClose={() => setShowAdd(false)}
            ocId={ocId}
            onCreated={reload}
          />
        )}
      </>
    );
  }

  const lapsed = summary.expired.length;
  const coverTone = lapsed > 0 ? "destructive" : summary.expiringSoon.length > 0 ? "warning" : "success";
  const coverValue =
    lapsed > 0
      ? `${lapsed} lapsed`
      : summary.expiringSoon.length > 0
        ? `${summary.expiringSoon.length} expiring`
        : "Covered";
  const renewalDays = summary.nextRenewal ? daysUntil(summary.nextRenewal.end_date, now) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Cover"
          value={coverValue}
          tone={coverTone}
          icon={<ShieldCheck className="h-4 w-4" />}
          detail={`${summary.active.length + summary.expiringSoon.length} of ${policies.length} in force`}
        />
        <SummaryCard
          label="Next renewal"
          value={summary.nextRenewal ? formatDateLong(summary.nextRenewal.end_date) : ""}
          tone={renewalDays !== null && renewalDays <= 30 ? "warning" : "default"}
          icon={<CalendarIcon className="h-4 w-4" />}
          detail={
            summary.nextRenewal
              ? `${POLICY_LABELS[summary.nextRenewal.policy_type] ?? summary.nextRenewal.policy_type}${
                  renewalDays !== null ? ` , in ${renewalDays} days` : ""
                }`
              : undefined
          }
        />
        <SummaryCard
          label="Premium a year"
          value={summary.annualPremium ? formatCurrency(summary.annualPremium) : ""}
          icon={<Wallet className="h-4 w-4" />}
          detail="Across policies in force"
        />
        <SummaryCard
          label="Certificates"
          value={
            summary.certificatesMissing === 0
              ? "All on file"
              : `${summary.certificatesMissing} missing`
          }
          tone={summary.certificatesMissing === 0 ? "success" : "warning"}
          icon={<FileCheck className="h-4 w-4" />}
          detail="What owners and lenders ask for"
        />
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end">
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Add policy
          </Button>
        </div>
      )}

      <PolicyTable policies={policies} now={now} onSelect={setSelectedPolicy} />

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Cover timeline</h2>
        {/* Kept, demoted. A table cannot show a GAP between one policy
            ending and the next starting, which is the one thing worth
            seeing at a glance and the one thing that gets an OC in
            trouble. It is no longer the whole page. */}
        <InsuranceGantt
          policies={policies}
          managementStartDate={managementStartDate ?? null}
          fyStartMonth={fyStartMonth}
          onPolicyClick={setSelectedPolicy}
        />
      </div>

      {showAdd && (
        <AddPolicyDrawer
          open={showAdd}
          onClose={() => setShowAdd(false)}
          ocId={ocId}
          onCreated={reload}
        />
      )}

      <PolicyDetailDialog
        policy={selectedPolicy}
        open={!!selectedPolicy}
        onClose={() => setSelectedPolicy(null)}
        readOnly={readOnly}
        ocId={ocId}
        onUpdated={reload}
      />
    </div>
  );
}
