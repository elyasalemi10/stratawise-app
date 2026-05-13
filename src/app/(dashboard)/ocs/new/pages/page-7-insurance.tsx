"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, Plus, Shield, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { saveStep, uploadInsuranceDoc, type DraftJson, type DraftInsurancePolicy } from "../actions";

// Wizard page 7 — insurance policies on cover at setup.
//
// OCs commonly carry 3-4 policies (building, public liability, fidelity,
// voluntary workers). Page renders a stack of policy cards; "+ Add another
// policy" appends. One shared supporting PDF (managers usually upload one
// combined schedule).

const POLICY_TYPES: Array<{ value: DraftInsurancePolicy["policy_type"]; label: string }> = [
  { value: "building",          label: "Building insurance" },
  { value: "public_liability",  label: "Public liability" },
  { value: "combined",          label: "Combined building + public liability" },
  { value: "fidelity",          label: "Fidelity / office bearers" },
  { value: "voluntary_workers", label: "Voluntary workers" },
  { value: "other",             label: "Other" },
];

function blankPolicy(): DraftInsurancePolicy {
  return {
    provider: "",
    policy_number: "",
    policy_type: "combined",
    sum_insured: undefined,
    premium: undefined,
    start_date: "",
    end_date: "",
  };
}

// Mostly cosmetic; client-side validation only.
type PolicyInvalid = { provider: boolean; type: boolean; start: boolean; end: boolean };
const NO_PI: PolicyInvalid = { provider: false, type: false, start: false, end: false };

function migrateLegacy(initialDraft: DraftJson): DraftInsurancePolicy[] {
  if (initialDraft.insurance_policies && initialDraft.insurance_policies.length > 0) {
    return initialDraft.insurance_policies;
  }
  if (initialDraft.insurance_provider && initialDraft.insurance_start_date && initialDraft.insurance_end_date) {
    return [{
      provider: initialDraft.insurance_provider,
      policy_number: initialDraft.insurance_policy_number,
      policy_type: (initialDraft.insurance_policy_type as DraftInsurancePolicy["policy_type"]) ?? "combined",
      sum_insured: initialDraft.insurance_sum_insured,
      premium: initialDraft.insurance_premium,
      start_date: initialDraft.insurance_start_date,
      end_date: initialDraft.insurance_end_date,
    }];
  }
  return [blankPolicy()];
}

export function Page7Insurance({
  draftId,
  initialDraft,
  initialDocFilename,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  initialDocFilename: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const [hasInsurance, setHasInsurance] = useState(initialDraft.has_insurance ?? true);
  const [policies, setPolicies] = useState<DraftInsurancePolicy[]>(() => migrateLegacy(initialDraft));
  const [invalidByIdx, setInvalidByIdx] = useState<Record<number, PolicyInvalid>>({});
  const [docFilename, setDocFilename] = useState<string | null>(initialDocFilename);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const dragDepthRef = useRef(0);

  function updatePolicy(idx: number, patch: Partial<DraftInsurancePolicy>) {
    setPolicies((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPolicy() {
    setPolicies((prev) => [...prev, blankPolicy()]);
  }
  function removePolicy(idx: number) {
    setPolicies((prev) => prev.filter((_, i) => i !== idx));
    setInvalidByIdx((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }
  function clearInvalid(idx: number, field: keyof PolicyInvalid) {
    setInvalidByIdx((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] ?? NO_PI), [field]: false },
    }));
  }

  async function handleFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Policy PDF exceeds 25MB.");
      return;
    }
    setDocFilename(file.name);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadInsuranceDoc(draftId, fd);
    setUploading(false);
    if (r.error) {
      setDocFilename(null);
      toast.error(r.error);
    }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }
  function onDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  async function onContinue() {
    if (!hasInsurance) {
      setPending(true);
      const r = await saveStep(draftId, { has_insurance: false, insurance_policies: [] }, 8);
      setPending(false);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onNext();
      return;
    }
    const problems: string[] = [];
    const flagsByIdx: Record<number, PolicyInvalid> = {};
    policies.forEach((p, idx) => {
      const flags: PolicyInvalid = {
        provider: p.provider.trim().length < 2,
        type: !p.policy_type,
        start: !p.start_date,
        end: !p.end_date,
      };
      if (Object.values(flags).some(Boolean)) {
        flagsByIdx[idx] = flags;
        problems.push(`Policy ${idx + 1}: missing required fields`);
      }
      if (p.start_date && p.end_date && p.end_date <= p.start_date) {
        problems.push(`Policy ${idx + 1}: end date must be after start`);
      }
    });
    setInvalidByIdx(flagsByIdx);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }
    setPending(true);
    const r = await saveStep(draftId, {
      has_insurance: true,
      insurance_policies: policies,
      // Keep legacy single-policy fields populated from policy #1 for any
      // older code path that still reads them.
      insurance_provider: policies[0]?.provider,
      insurance_policy_number: policies[0]?.policy_number,
      insurance_policy_type: policies[0]?.policy_type,
      insurance_sum_insured: policies[0]?.sum_insured,
      insurance_premium: policies[0]?.premium,
      insurance_start_date: policies[0]?.start_date,
      insurance_end_date: policies[0]?.end_date,
      insurance_doc_filename: docFilename ?? undefined,
    }, 8);
    setPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Insurance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Policies on cover at takeover. The OC Act requires building cover for tier 1-4 OCs.
        </p>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">This OC has insurance</h3>
          </div>
          <Switch
            checked={hasInsurance}
            onCheckedChange={(v) => setHasInsurance(v === true)}
            aria-label="This OC has active insurance policies"
          />
        </div>
        {!hasInsurance && (
          <p className="mt-2 text-xs text-muted-foreground">
            Most OCs are legally required to hold building insurance. Add policies later from
            the OC&apos;s insurance page if you toggle this off.
          </p>
        )}
      </div>

      {hasInsurance && (
        <>
          <div className="space-y-4">
            {policies.map((p, idx) => {
              const inv = invalidByIdx[idx] ?? NO_PI;
              return (
                <div key={idx} className="rounded-md border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">Policy {idx + 1}</h4>
                    {policies.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePolicy(idx)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                        aria-label={`Remove policy ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`prov-${idx}`}>
                        Insurer <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id={`prov-${idx}`}
                        placeholder="e.g. CHU, Strata Community Insurance, QBE"
                        value={p.provider}
                        onChange={(e) => { updatePolicy(idx, { provider: e.target.value }); clearInvalid(idx, "provider"); }}
                        aria-invalid={inv.provider || undefined}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`num-${idx}`}>Policy number</Label>
                      <Input
                        id={`num-${idx}`}
                        value={p.policy_number ?? ""}
                        onChange={(e) => updatePolicy(idx, { policy_number: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`type-${idx}`}>
                        Policy type <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={p.policy_type}
                        onValueChange={(v) => { updatePolicy(idx, { policy_type: (v as DraftInsurancePolicy["policy_type"]) ?? "combined" }); clearInvalid(idx, "type"); }}
                      >
                        <SelectTrigger id={`type-${idx}`} aria-invalid={inv.type || undefined} className="w-full">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {POLICY_TYPES.map((pt) => (
                            <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`sum-${idx}`}>Sum insured</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <NumberInput
                          id={`sum-${idx}`}
                          value={p.sum_insured != null ? String(p.sum_insured) : ""}
                          onChange={(v) => updatePolicy(idx, { sum_insured: v ? parseFloat(v) : undefined })}
                          placeholder="e.g. 12500000"
                          className="pl-7"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`prem-${idx}`}>Annual premium</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <NumberInput
                          id={`prem-${idx}`}
                          value={p.premium != null ? String(p.premium) : ""}
                          onChange={(v) => updatePolicy(idx, { premium: v ? parseFloat(v) : undefined })}
                          placeholder="0.00"
                          className="pl-7"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Start date <span className="text-destructive">*</span>
                      </Label>
                      <DatePicker
                        value={p.start_date}
                        onChange={(v) => { updatePolicy(idx, { start_date: v }); clearInvalid(idx, "start"); }}
                        error={inv.start}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        End date <span className="text-destructive">*</span>
                      </Label>
                      <DatePicker
                        value={p.end_date}
                        onChange={(v) => { updatePolicy(idx, { end_date: v }); clearInvalid(idx, "end"); }}
                        error={inv.end}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Button type="button" variant="secondary" onClick={addPolicy} className="w-full">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add another policy
            </Button>
          </div>

          {/* Shared supporting PDF (optional). */}
          <div className="space-y-2">
            <Label>Policy schedule (PDF) — covers all policies above</Label>
            {!docFilename ? (
              <div
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className={`rounded-lg border-2 border-dashed transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"
                }`}
              >
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 px-6 py-6">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.target.value = "";
                    }}
                  />
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {isDragging ? "Drop the policy here" : "Optional — click or drag the policy schedule PDF"}
                  </p>
                </label>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <div className="flex items-center gap-2 min-w-0">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  )}
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">{docFilename}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDocFilename(null)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label="Remove policy file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending || uploading}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
