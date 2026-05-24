"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { saveStep, type DraftJson } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 1 sub-step 2 , Management fee.

type FeeStructure = "fixed_monthly" | "per_lot_monthly" | "hybrid" | "quarterly_retainer";
type BillingMethod = "invoice_direct" | "include_in_levies";
type ContractTerm = "rolling_12" | "term_24" | "custom";
type CustomUnit = "days" | "months" | "years";

const FEE_STRUCTURES: Array<{ value: FeeStructure; label: string }> = [
  { value: "fixed_monthly", label: "Fixed monthly" },
  { value: "per_lot_monthly", label: "Per-lot per-month" },
  { value: "hybrid", label: "Hybrid (fixed + per-lot)" },
  { value: "quarterly_retainer", label: "Quarterly retainer" },
];
const FEE_STRUCTURE_LABEL: Record<FeeStructure, string> = Object.fromEntries(
  FEE_STRUCTURES.map((s) => [s.value, s.label]),
) as Record<FeeStructure, string>;

const CONTRACT_TERMS: Array<{ value: ContractTerm; label: string }> = [
  { value: "rolling_12", label: "12 months rolling" },
  { value: "term_24", label: "24 months" },
  { value: "custom", label: "Custom" },
];
const CONTRACT_TERM_LABEL: Record<ContractTerm, string> = Object.fromEntries(
  CONTRACT_TERMS.map((t) => [t.value, t.label]),
) as Record<ContractTerm, string>;

const CUSTOM_UNITS: Array<{ value: CustomUnit; label: string }> = [
  { value: "days", label: "Days" },
  { value: "months", label: "Months" },
  { value: "years", label: "Years" },
];

function InlineYesNoToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center justify-between rounded-md border px-3 h-9 cursor-pointer transition-colors w-[180px] ${
        value ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
      }`}
    >
      <span className="text-sm">{value ? "Yes" : "No"}</span>
      <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-border"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

export function Step1ManagementFee({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  const mf = initialDraft.management_fee;

  const [structure, setStructure] = useState<FeeStructure | "">(
    (mf?.structure as FeeStructure | undefined) ?? "",
  );
  const [structureInvalid, setStructureInvalid] = useState(false);

  const [fixedAmount, setFixedAmount] = useState<string>(
    mf?.fixed_amount_cents != null ? String(mf.fixed_amount_cents / 100) : "",
  );
  const [perLotAmount, setPerLotAmount] = useState<string>(
    mf?.per_lot_amount_cents != null ? String(mf.per_lot_amount_cents / 100) : "",
  );
  const [amountInvalid, setAmountInvalid] = useState<{ fixed: boolean; perLot: boolean }>({ fixed: false, perLot: false });

  const [gstApplicable, setGstApplicable] = useState<boolean>(
    mf?.gst_applicable ?? (initialDraft.gst_registered ?? false),
  );

  const [billingMethod, setBillingMethod] = useState<BillingMethod | "">(
    (mf?.billing_method as BillingMethod | undefined) ?? "",
  );
  const [billingMethodInvalid, setBillingMethodInvalid] = useState(false);

  const [contractTerm, setContractTerm] = useState<ContractTerm>(
    (mf?.contract_term as ContractTerm | undefined) ?? "rolling_12",
  );
  // Custom term: how many days/months/years.
  const [customLength, setCustomLength] = useState<string>("");
  const [customUnit, setCustomUnit] = useState<CustomUnit>("months");
  const [customInvalid, setCustomInvalid] = useState(false);

  const [pending, setPending] = useState(false);

  async function onContinue() {
    const problems: string[] = [];

    if (!structure) {
      problems.push("Fee structure is required.");
      setStructureInvalid(true);
    } else {
      setStructureInvalid(false);
    }

    let fixedNum: number | null = null;
    let perLotNum: number | null = null;
    const newAmountInvalid = { fixed: false, perLot: false };
    if (structure === "fixed_monthly" || structure === "quarterly_retainer") {
      fixedNum = parseFloat(fixedAmount);
      if (!Number.isFinite(fixedNum) || fixedNum <= 0) {
        problems.push("Fee amount must be greater than $0.");
        newAmountInvalid.fixed = true;
      }
    } else if (structure === "per_lot_monthly") {
      perLotNum = parseFloat(perLotAmount);
      if (!Number.isFinite(perLotNum) || perLotNum <= 0) {
        problems.push("Per-lot fee amount must be greater than $0.");
        newAmountInvalid.perLot = true;
      }
    } else if (structure === "hybrid") {
      fixedNum = parseFloat(fixedAmount);
      perLotNum = parseFloat(perLotAmount);
      if (!Number.isFinite(fixedNum) || fixedNum <= 0) {
        problems.push("Fixed monthly amount must be greater than $0.");
        newAmountInvalid.fixed = true;
      }
      if (!Number.isFinite(perLotNum) || perLotNum <= 0) {
        problems.push("Per-lot amount must be greater than $0.");
        newAmountInvalid.perLot = true;
      }
    }
    setAmountInvalid(newAmountInvalid);

    if (!billingMethod) {
      problems.push("Billing method is required.");
      setBillingMethodInvalid(true);
    } else {
      setBillingMethodInvalid(false);
    }

    // Custom term must have a positive length.
    if (contractTerm === "custom") {
      const len = parseInt(customLength, 10);
      if (!Number.isFinite(len) || len <= 0) {
        problems.push("Custom term length must be a positive number.");
        setCustomInvalid(true);
      } else {
        setCustomInvalid(false);
      }
    } else {
      setCustomInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    const fixedCents = fixedNum != null ? Math.round(fixedNum * 100) : undefined;
    const perLotCents = perLotNum != null ? Math.round(perLotNum * 100) : undefined;

    // For custom terms, we don't know exactly how to map days/months/years to
    // a single contract_end_date here without the start date in hand , that's
    // computed at save-time downstream. Persist the raw choice for now; the
    // detailed end-date materialisation is part of the deferred management-fee
    // engine.
    setPending(true);
    const r = await saveStep(draftId, {
      management_fee: {
        structure: structure as FeeStructure,
        fixed_amount_cents:
          structure === "fixed_monthly" || structure === "quarterly_retainer" || structure === "hybrid"
            ? fixedCents
            : undefined,
        per_lot_amount_cents:
          structure === "per_lot_monthly" || structure === "hybrid"
            ? perLotCents
            : undefined,
        gst_applicable: gstApplicable,
        billing_method: billingMethod as BillingMethod,
        contract_term: contractTerm,
      },
    }, 2, 0); // Advance to Step 2 main page (Settings).
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  const showFixed = structure === "fixed_monthly" || structure === "quarterly_retainer" || structure === "hybrid";
  const showPerLot = structure === "per_lot_monthly" || structure === "hybrid";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Management fee</h2>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fee-structure">
            Fee structure <span className="text-destructive">*</span>
          </Label>
          <Select
            value={structure || undefined}
            onValueChange={(v) => { setStructure((v as FeeStructure) ?? ""); if (structureInvalid) setStructureInvalid(false); }}
          >
            <SelectTrigger id="fee-structure" aria-invalid={structureInvalid || undefined} className="w-full">
              <SelectValue placeholder="Pick a fee structure">
                {structure ? FEE_STRUCTURE_LABEL[structure as FeeStructure] : "Pick a fee structure"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FEE_STRUCTURES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(showFixed || showPerLot) && (
          <div className={`grid gap-4 ${showFixed && showPerLot ? "grid-cols-2" : "grid-cols-1"}`}>
            {showFixed && (
              <div className="space-y-1.5">
                <Label htmlFor="fee-fixed">
                  {structure === "hybrid" ? "Fixed monthly amount" : structure === "quarterly_retainer" ? "Quarterly retainer amount" : "Monthly fee amount"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <NumberInput
                  id="fee-fixed"
                  thousandsSeparator
                  prefix="$"
                  value={fixedAmount}
                  onChange={(v) => { setFixedAmount(v); if (amountInvalid.fixed) setAmountInvalid((p) => ({ ...p, fixed: false })); }}
                  invalid={amountInvalid.fixed}
                  placeholder="Amount"
                />
              </div>
            )}
            {showPerLot && (
              <div className="space-y-1.5">
                <Label htmlFor="fee-per-lot">
                  Per-lot per-month amount <span className="text-destructive">*</span>
                </Label>
                <NumberInput
                  id="fee-per-lot"
                  thousandsSeparator
                  prefix="$"
                  value={perLotAmount}
                  onChange={(v) => { setPerLotAmount(v); if (amountInvalid.perLot) setAmountInvalid((p) => ({ ...p, perLot: false })); }}
                  invalid={amountInvalid.perLot}
                  placeholder="Per-lot amount"
                />
              </div>
            )}
          </div>
        )}

        {/* GST applicable on fee , inline-toggle row matching the General step
            pattern (not a card). */}
        <div className="flex items-center justify-between gap-3">
          <Label>GST applicable on fee</Label>
          <InlineYesNoToggle value={gstApplicable} onChange={setGstApplicable} />
        </div>

        <div className="space-y-2">
          <Label>
            Billing method <span className="text-destructive">*</span>
          </Label>
          <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${billingMethodInvalid ? "rounded-md border border-destructive ring-2 ring-destructive/20 p-2" : ""}`}>
            <button
              type="button"
              onClick={() => { setBillingMethod("invoice_direct"); if (billingMethodInvalid) setBillingMethodInvalid(false); }}
              className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
                billingMethod === "invoice_direct" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <h4 className="text-sm font-semibold text-foreground">Invoice the OC directly</h4>
              <p className="mt-1 text-xs text-muted-foreground">Send a separate invoice; the OC pays you outside the levy cycle.</p>
            </button>
            <button
              type="button"
              onClick={() => { setBillingMethod("include_in_levies"); if (billingMethodInvalid) setBillingMethodInvalid(false); }}
              className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
                billingMethod === "include_in_levies" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <h4 className="text-sm font-semibold text-foreground">Include in quarterly levies</h4>
              <p className="mt-1 text-xs text-muted-foreground">Fee collected through levies and transferred from the OC trust account after each levy run.</p>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contract-term">Contract term</Label>
          <Select
            value={contractTerm}
            onValueChange={(v) => setContractTerm((v as ContractTerm) ?? "rolling_12")}
          >
            <SelectTrigger id="contract-term" className="w-full">
              <SelectValue>{CONTRACT_TERM_LABEL[contractTerm]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CONTRACT_TERMS.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {contractTerm === "custom" && (
            <div className="mt-2 grid grid-cols-[1fr_180px] gap-2">
              <NumberInput
                allowDecimal={false}
                value={customLength}
                onChange={(v) => { setCustomLength(v); if (customInvalid) setCustomInvalid(false); }}
                invalid={customInvalid}
                placeholder="Length"
              />
              <Select value={customUnit} onValueChange={(v) => setCustomUnit((v as CustomUnit) ?? "months")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{CUSTOM_UNITS.find((u) => u.value === customUnit)?.label ?? "Months"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      <WizardActions
        draftId={draftId}
        onBack={onBack}
        onContinue={onContinue}
        continuePending={pending}
        getCurrentPatch={() => {
          const fixedNumRaw = parseFloat(fixedAmount);
          const perLotNumRaw = parseFloat(perLotAmount);
          return {
            management_fee: {
              structure: structure as FeeStructure,
              fixed_amount_cents: Number.isFinite(fixedNumRaw) ? Math.round(fixedNumRaw * 100) : undefined,
              per_lot_amount_cents: Number.isFinite(perLotNumRaw) ? Math.round(perLotNumRaw * 100) : undefined,
              gst_applicable: gstApplicable,
              billing_method: (billingMethod as BillingMethod) || undefined,
              contract_term: contractTerm,
            },
          };
        }}
      />
    </div>
  );
}
