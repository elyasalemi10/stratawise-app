"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Loader2, Shield, Upload, X } from "lucide-react";
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
import { saveStep, uploadInsuranceDoc, type DraftJson } from "../actions";

// Wizard page 7 — primary insurance policy.
// OC Act 2006 §59-60 requires building cover for tier 1-4 OCs (services-only
// tier 5 OCs are exempt). We capture: insurer, policy number, type, sum
// insured, premium, term, and the policy schedule PDF.

const POLICY_TYPES = [
  { value: "building", label: "Building insurance" },
  { value: "public_liability", label: "Public liability" },
  { value: "combined", label: "Combined building + public liability" },
  { value: "other", label: "Other" },
];

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
  const [provider, setProvider] = useState(initialDraft.insurance_provider ?? "");
  const [policyNumber, setPolicyNumber] = useState(initialDraft.insurance_policy_number ?? "");
  const [policyType, setPolicyType] = useState(initialDraft.insurance_policy_type ?? "combined");
  const [sumInsured, setSumInsured] = useState<string>(
    initialDraft.insurance_sum_insured != null ? String(initialDraft.insurance_sum_insured) : "",
  );
  const [premium, setPremium] = useState<string>(
    initialDraft.insurance_premium != null ? String(initialDraft.insurance_premium) : "",
  );
  const [startDate, setStartDate] = useState(initialDraft.insurance_start_date ?? "");
  const [endDate, setEndDate] = useState(initialDraft.insurance_end_date ?? "");
  const [docFilename, setDocFilename] = useState<string | null>(initialDocFilename);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  // Field-invalid flags.
  const [invalid, setInvalid] = useState({
    provider: false, type: false, start: false, end: false,
  });
  const [pending, setPending] = useState(false);

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
      const r = await saveStep(draftId, { has_insurance: false }, 8);
      setPending(false);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onNext();
      return;
    }
    const problems: string[] = [];
    const flags = {
      provider: provider.trim().length < 2,
      type: !policyType,
      start: !startDate,
      end: !endDate,
    };
    if (flags.provider) problems.push("Insurer name is required");
    if (flags.type) problems.push("Policy type is required");
    if (flags.start) problems.push("Start date is required");
    if (flags.end) problems.push("End date is required");
    if (startDate && endDate && endDate <= startDate) problems.push("End date must be after start date");
    setInvalid(flags);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }
    setPending(true);
    const r = await saveStep(draftId, {
      has_insurance: true,
      insurance_provider: provider.trim(),
      insurance_policy_number: policyNumber.trim() || undefined,
      insurance_policy_type: policyType,
      insurance_sum_insured: sumInsured ? parseFloat(sumInsured) : undefined,
      insurance_premium: premium ? parseFloat(premium) : undefined,
      insurance_start_date: startDate,
      insurance_end_date: endDate,
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
          The primary policy on cover when you took over. The OC Act requires building
          cover for tier 1-4 OCs.
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
            aria-label="This OC has an active insurance policy"
          />
        </div>
        {!hasInsurance && (
          <p className="mt-2 text-xs text-muted-foreground">
            Most OCs are legally required to hold building insurance. Add a
            policy later from the OC&apos;s insurance page if you toggle this off.
          </p>
        )}
      </div>

      {hasInsurance && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ins-provider">
                Insurer <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ins-provider"
                placeholder="e.g. CHU, Strata Community Insurance, QBE"
                value={provider}
                onChange={(e) => { setProvider(e.target.value); if (invalid.provider) setInvalid({ ...invalid, provider: false }); }}
                aria-invalid={invalid.provider || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-policy">Policy number</Label>
              <Input
                id="ins-policy"
                value={policyNumber}
                onChange={(e) => setPolicyNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ins-type">
                Policy type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={policyType}
                onValueChange={(v) => { setPolicyType(v ?? "combined"); if (invalid.type) setInvalid({ ...invalid, type: false }); }}
              >
                <SelectTrigger id="ins-type" aria-invalid={invalid.type || undefined} className="w-full">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ins-sum">Sum insured</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <NumberInput
                  id="ins-sum"
                  value={sumInsured}
                  onChange={setSumInsured}
                  placeholder="e.g. 12500000"
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ins-premium">Annual premium</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <NumberInput
                  id="ins-premium"
                  value={premium}
                  onChange={setPremium}
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
                value={startDate}
                onChange={(v) => { setStartDate(v); if (invalid.start) setInvalid({ ...invalid, start: false }); }}
                error={invalid.start}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                End date <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                value={endDate}
                onChange={(v) => { setEndDate(v); if (invalid.end) setInvalid({ ...invalid, end: false }); }}
                error={invalid.end}
              />
            </div>
          </div>

          {/* Policy schedule PDF (optional). */}
          <div className="space-y-2">
            <Label>Policy schedule (PDF)</Label>
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
