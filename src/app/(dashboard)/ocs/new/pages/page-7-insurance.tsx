"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Shield, ShieldOff, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/shared/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { deleteCoC, saveStep, uploadAndParseCoC, type DraftJson, type DraftInsurancePolicy } from "../actions";

// Wizard page 7 — insurance.
//
// Flow:
//   1. Top-level chooser: does this OC have insurance? Two tiles.
//      - "No" path: persist has_insurance=false and advance to page 8.
//      - "Yes" path: show the upload + manual-entry surface.
//   2. CoC upload (multiple allowed) auto-parses and prefills the policies
//      list. The PS number from the cert is compared to the OC's PS — on
//      mismatch we ask the manager to confirm before prefilling.
//   3. Inline link to switch into manual entry — same policies array, but
//      the user fills in each card by hand.

type POLICY_VALUE = DraftInsurancePolicy["policy_type"];

const POLICY_TYPES: Array<{ value: POLICY_VALUE; label: string }> = [
  { value: "building",          label: "Building Insurance" },
  { value: "public_liability",  label: "Public Liability" },
  { value: "combined",          label: "Combined Building + Public Liability" },
  { value: "fidelity",          label: "Fidelity / Office Bearers" },
  { value: "voluntary_workers", label: "Voluntary Workers" },
  { value: "other",             label: "Other" },
];
function labelForPolicyType(v: POLICY_VALUE): string {
  return POLICY_TYPES.find((p) => p.value === v)?.label ?? v;
}

function blankPolicy(): DraftInsurancePolicy {
  return {
    provider: "",
    policy_number: "",
    policy_type: "combined",
    sum_insured: undefined,
    premium: undefined,
    start_date: "",
    end_date: "",
    notes: "",
  };
}

type PolicyInvalid = {
  provider: boolean;
  type: boolean;
  number: boolean;
  sumInsured: boolean;
  premium: boolean;
  start: boolean;
  end: boolean;
};
const NO_PI: PolicyInvalid = { provider: false, type: false, number: false, sumInsured: false, premium: false, start: false, end: false };

type Coc = {
  storage_key: string;
  filename: string;
  size_bytes: number;
  plan_number: string | null;
  insured_name: string | null;
  ps_match: boolean;
};

// Pending CoC waiting on a PS-mismatch confirm. We hold the parsed payload
// here; if the user accepts, we apply it to the policies list and persist it.
// Parsed policies arrive from the server with `policy_number: string | null`;
// DraftInsurancePolicy uses `string | undefined`. We normalise on receipt.
type ParsedFromServer = {
  provider: string;
  policy_number: string | null;
  policy_type: POLICY_VALUE;
  sum_insured: number | null;
  premium: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

type PendingCoc = {
  coc: Coc;
  policies: ParsedFromServer[];
  expectedPlanNumber: string;
};

function migrateLegacy(initialDraft: DraftJson): DraftInsurancePolicy[] {
  if (initialDraft.insurance_policies && initialDraft.insurance_policies.length > 0) {
    return initialDraft.insurance_policies;
  }
  if (initialDraft.insurance_provider && initialDraft.insurance_start_date && initialDraft.insurance_end_date) {
    return [{
      provider: initialDraft.insurance_provider,
      policy_number: initialDraft.insurance_policy_number,
      policy_type: (initialDraft.insurance_policy_type as POLICY_VALUE) ?? "combined",
      sum_insured: initialDraft.insurance_sum_insured,
      premium: initialDraft.insurance_premium,
      start_date: initialDraft.insurance_start_date,
      end_date: initialDraft.insurance_end_date,
    }];
  }
  return [];
}

export function Page7Insurance({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  // initialDocFilename was the legacy single-doc filename; the new multi-CoC
  // path stores everything in draft_json.insurance_cocs.
  initialDocFilename?: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const [hasInsurance, setHasInsurance] = useState<boolean | null>(
    initialDraft.has_insurance === undefined ? null : initialDraft.has_insurance,
  );
  const [policies, setPolicies] = useState<DraftInsurancePolicy[]>(() => migrateLegacy(initialDraft));
  const [cocs, setCocs] = useState<Coc[]>(initialDraft.insurance_cocs ?? []);
  const [invalidByIdx, setInvalidByIdx] = useState<Record<number, PolicyInvalid>>({});
  const [uploading, setUploading] = useState(false);
  const [pendingCoc, setPendingCoc] = useState<PendingCoc | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const ocPlanNumber = (initialDraft.plan_number ?? "").toUpperCase().trim();

  function updatePolicy(idx: number, patch: Partial<DraftInsurancePolicy>) {
    setPolicies((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    setInvalidByIdx((prev) => {
      if (!prev[idx]) return prev;
      const cur = { ...prev[idx] };
      if ("provider" in patch) cur.provider = false;
      if ("policy_number" in patch) cur.number = false;
      if ("policy_type" in patch) cur.type = false;
      if ("sum_insured" in patch) cur.sumInsured = false;
      if ("premium" in patch) cur.premium = false;
      if ("start_date" in patch) cur.start = false;
      if ("end_date" in patch) cur.end = false;
      return { ...prev, [idx]: cur };
    });
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

  async function handleFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Certificate exceeds 25MB.");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadAndParseCoC(draftId, fd, ocPlanNumber || undefined);
    setUploading(false);
    if (r.error || !r.success || !r.storage_key || !r.policies) {
      toast.error(r.error ?? "Couldn't process this certificate.");
      return;
    }
    const coc: Coc = {
      storage_key: r.storage_key,
      filename: r.filename!,
      size_bytes: r.size_bytes!,
      plan_number: r.plan_number ?? null,
      insured_name: r.insured_name ?? null,
      ps_match: r.ps_match ?? false,
    };
    // If we know the OC's PS but the cert PS doesn't match, hold the parse
    // result aside and ask the manager to confirm before prefilling.
    if (ocPlanNumber && !coc.ps_match) {
      setPendingCoc({ coc, policies: r.policies as ParsedFromServer[], expectedPlanNumber: ocPlanNumber });
      return;
    }
    applyParsedCoc(coc, r.policies as ParsedFromServer[]);
  }

  function applyParsedCoc(coc: Coc, parsed: ParsedFromServer[]) {
    const additions: DraftInsurancePolicy[] = parsed.map((p) => ({
      provider: p.provider,
      policy_number: p.policy_number ?? "",
      policy_type: p.policy_type,
      sum_insured: p.sum_insured ?? undefined,
      premium: p.premium ?? undefined,
      start_date: p.start_date ?? "",
      end_date: p.end_date ?? "",
      notes: p.notes ?? "",
      // Tag each policy with the R2 key of the CoC it came from so
      // completeWizard can wire insurance_policies.source_document_id back
      // to the documents row created from this cert.
      source_coc_storage_key: coc.storage_key,
    }));
    setPolicies((prev) => [...prev, ...additions]);
    setCocs((prev) => [...prev, coc]);
    toast.success(`Added ${additions.length} polic${additions.length === 1 ? "y" : "ies"} from ${coc.filename}.`);
  }

  async function discardCoc(coc: Coc) {
    setCocs((prev) => prev.filter((c) => c.storage_key !== coc.storage_key));
    await deleteCoC(draftId, coc.storage_key);
  }

  async function onContinue() {
    if (hasInsurance === false) {
      setPending(true);
      const r = await saveStep(draftId, { has_insurance: false, insurance_policies: [], insurance_cocs: [] }, 8);
      if (r.error) {
        setPending(false);
        toast.error(r.error);
        return;
      }
      await onNext();
      return;
    }
    if (hasInsurance === null) {
      toast.error("Tell us whether this OC has insurance.");
      return;
    }

    // Per-policy validation. Provider, type, policy number, premium, and dates
    // are all required when has_insurance=true.
    const problems: string[] = [];
    const flagsByIdx: Record<number, PolicyInvalid> = {};
    policies.forEach((p, idx) => {
      const flags: PolicyInvalid = {
        provider: p.provider.trim().length < 2,
        type: !p.policy_type,
        number: !p.policy_number || p.policy_number.trim().length === 0,
        sumInsured: p.sum_insured == null,
        premium: p.premium == null,
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
    if (policies.length === 0) {
      problems.push("Add at least one policy, or toggle 'No insurance'.");
    }
    setInvalidByIdx(flagsByIdx);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      has_insurance: true,
      insurance_policies: policies,
      insurance_cocs: cocs,
      insurance_provider: policies[0]?.provider,
      insurance_policy_number: policies[0]?.policy_number,
      insurance_policy_type: policies[0]?.policy_type,
      insurance_sum_insured: policies[0]?.sum_insured,
      insurance_premium: policies[0]?.premium,
      insurance_start_date: policies[0]?.start_date,
      insurance_end_date: policies[0]?.end_date,
      insurance_doc_filename: cocs[0]?.filename,
    }, 8);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Insurance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Policies on cover at takeover. The OC Act requires building cover for tier 1–4 OCs.
        </p>
      </div>

      {/* Top tile chooser — has insurance Y/N. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setHasInsurance(true)}
          className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
            hasInsurance === true ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">This OC has insurance</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a Certificate of Currency and we&apos;ll read the policies, or enter them by hand.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setHasInsurance(false)}
          className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
            hasInsurance === false ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">No insurance yet</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            You can add policies later from the OC&apos;s insurance page. Most OCs are legally required to hold building insurance.
          </p>
        </button>
      </div>

      {hasInsurance === true && (
        <>
          {/* Uploaded CoCs list. */}
          {cocs.length > 0 && (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Uploaded certificates
              </div>
              <ul className="divide-y divide-border">
                {cocs.map((coc) => (
                  <li key={coc.storage_key} className="flex items-center gap-3 px-4 py-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{coc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {coc.plan_number ? `${coc.plan_number}` : "Plan number not detected"}
                        {coc.insured_name ? ` — ${coc.insured_name}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => discardCoc(coc)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                      aria-label={`Remove ${coc.filename}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CoC upload — always available. Below it are the policy cards
              the manager can edit by hand. Upload + manual entry are not
              mutually-exclusive; the AI just prefills cards faster than typing
              them in. */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/60 px-6 py-10 text-sm text-muted-foreground hover:bg-card hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
              <span className="text-sm font-medium text-foreground">
                {uploading ? "Reading your certificate…" : "Upload a Certificate of Currency"}
              </span>
              <span className="text-xs">
                PDF only. We&apos;ll pull the insurer, policy number, sums insured, premium, and cover dates onto the form below. You can edit anything we get wrong.
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Policy cards — visible whenever there's a policy to edit. The
              "Add another policy" button appears underneath whether there are
              zero or many — the manager can always hand-enter another. */}
          <div className="space-y-4">{policies.length > 0 && (
            <div className="space-y-4">
              {policies.map((p, idx) => {
                const inv = invalidByIdx[idx] ?? NO_PI;
                return (
                  <div key={idx} className="rounded-md border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">Policy {idx + 1}</h4>
                      <button
                        type="button"
                        onClick={() => removePolicy(idx)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer"
                        aria-label={`Remove policy ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor={`prov-${idx}`}>
                          Insurer <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`prov-${idx}`}
                          placeholder="Insurer / underwriter name"
                          value={p.provider}
                          onChange={(e) => updatePolicy(idx, { provider: e.target.value })}
                          aria-invalid={inv.provider || undefined}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`num-${idx}`}>
                          Policy number <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`num-${idx}`}
                          placeholder="Policy number"
                          value={p.policy_number ?? ""}
                          onChange={(e) => updatePolicy(idx, { policy_number: e.target.value })}
                          aria-invalid={inv.number || undefined}
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
                          onValueChange={(v) => updatePolicy(idx, { policy_type: (v as POLICY_VALUE) ?? "combined" })}
                        >
                          <SelectTrigger id={`type-${idx}`} aria-invalid={inv.type || undefined} className="w-full">
                            <SelectValue placeholder="Select policy type">
                              {labelForPolicyType(p.policy_type)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {POLICY_TYPES.map((pt) => (
                              <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`sum-${idx}`}>
                          Sum insured <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                          <NumberInput
                            id={`sum-${idx}`}
                            value={p.sum_insured != null ? String(p.sum_insured) : ""}
                            onChange={(v) => updatePolicy(idx, { sum_insured: v ? parseFloat(v) : undefined })}
                            placeholder="Sum insured"
                            invalid={inv.sumInsured || undefined}
                            thousandsSeparator
                            className="pl-7"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`prem-${idx}`}>
                        Annual premium <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <NumberInput
                          id={`prem-${idx}`}
                          value={p.premium != null ? String(p.premium) : ""}
                          onChange={(v) => updatePolicy(idx, { premium: v ? parseFloat(v) : undefined })}
                          placeholder="Annual premium"
                          invalid={inv.premium || undefined}
                          thousandsSeparator
                          className="pl-7"
                        />
                      </div>
                    </div>

                    {/* Date-only start + end. Time fields were dropped — the
                        real-world CoC variability didn't justify the form
                        cost. If a manager needs to record "4pm to 4pm"
                        they can put it in notes. */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>
                          Start date <span className="text-destructive">*</span>
                        </Label>
                        <DatePicker
                          value={p.start_date}
                          onChange={(v) => updatePolicy(idx, { start_date: v })}
                          error={inv.start}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>
                          End date <span className="text-destructive">*</span>
                        </Label>
                        <DatePicker
                          value={p.end_date}
                          onChange={(v) => updatePolicy(idx, { end_date: v })}
                          error={inv.end}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`notes-${idx}`}>Notes</Label>
                      <Textarea
                        id={`notes-${idx}`}
                        value={p.notes ?? ""}
                        onChange={(e) => updatePolicy(idx, { notes: e.target.value })}
                        placeholder="Exclusions, endorsements, brokers, mid-year changes…"
                        rows={2}
                      />
                    </div>
                  </div>
                );
              })}

            </div>
          )}
            <Button
              type="button"
              variant="secondary"
              onClick={addPolicy}
              disabled={uploading}
              className="w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {policies.length === 0 ? "Add a policy" : "Add another policy"}
            </Button>
          </div>
        </>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={uploading}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending || uploading}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>

      {/* PS-mismatch confirm. The cert PS number doesn't match the OC's. */}
      <Dialog
        open={!!pendingCoc}
        onOpenChange={(open) => {
          if (!open && pendingCoc) {
            // User dismissed without clicking either button — treat as cancel
            // and clean up the orphan upload from R2.
            void deleteCoC(draftId, pendingCoc.coc.storage_key);
            setPendingCoc(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Is this the right certificate?</DialogTitle>
            <DialogDescription>
              The Plan-of-Subdivision number on this certificate
              {pendingCoc?.coc.plan_number ? (
                <> is <span className="font-medium text-foreground">{pendingCoc.coc.plan_number}</span></>
              ) : (
                <> wasn&apos;t found</>
              )}
              , but this OC is{" "}
              <span className="font-medium text-foreground">{pendingCoc?.expectedPlanNumber}</span>.
              Use it anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                if (pendingCoc) void deleteCoC(draftId, pendingCoc.coc.storage_key);
                setPendingCoc(null);
              }}
            >
              Cancel — wrong cert
            </Button>
            <Button
              onClick={() => {
                if (pendingCoc) {
                  applyParsedCoc(pendingCoc.coc, pendingCoc.policies);
                  setPendingCoc(null);
                }
              }}
            >
              Prefill anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
