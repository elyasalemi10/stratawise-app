"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { saveStep, type DraftJson } from "../actions";
import { nextLevyDue, formatLevyDueDisplay, type LevyFrequency } from "@/lib/levy-cadence";

// Wizard Step 2 — Settings.
//
// Financial year + levy frequency drive the live "First levy due" line.
// Levy calculation basis is captured; the per-lot custom-apportionment
// editor is deferred to a follow-up PR. Interest + early payment +
// arrears threshold are captured as new owners_corporations columns.

const MONTHS = [
  { value: 1,  label: "January" },
  { value: 2,  label: "February" },
  { value: 3,  label: "March" },
  { value: 4,  label: "April" },
  { value: 5,  label: "May" },
  { value: 6,  label: "June" },
  { value: 7,  label: "July" },
  { value: 8,  label: "August" },
  { value: 9,  label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const LEVY_FREQUENCIES: Array<{ value: LevyFrequency; label: string; periodsPerYear: number }> = [
  { value: "annually",    label: "Annually (1)",     periodsPerYear: 1 },
  { value: "half_yearly", label: "Half-yearly (2)",  periodsPerYear: 2 },
  { value: "quarterly",   label: "Quarterly (4)",    periodsPerYear: 4 },
  { value: "monthly",     label: "Monthly (12)",     periodsPerYear: 12 },
];

const LEVY_BASIS = [
  { value: "lot_liability", label: "Lot liability (standard)" },
  { value: "equal_per_lot", label: "Equal per lot" },
  { value: "custom_apportionment", label: "Custom apportionment" },
] as const;
type LevyBasis = typeof LEVY_BASIS[number]["value"];

export function Step2Settings({
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
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [levyFreq, setLevyFreq] = useState<LevyFrequency>(
    (initialDraft.billing_cycle as LevyFrequency | undefined) ?? "quarterly",
  );

  const [basis, setBasis] = useState<LevyBasis>(
    initialDraft.levy_calculation_basis ?? "lot_liability",
  );

  const [earlyPaymentPct, setEarlyPaymentPct] = useState<string>(
    initialDraft.early_payment_incentive_percent != null
      ? String(initialDraft.early_payment_incentive_percent)
      : "0",
  );
  const [earlyPaymentInvalid, setEarlyPaymentInvalid] = useState(false);

  const [interestEnabled, setInterestEnabled] = useState<boolean>(
    initialDraft.interest_on_overdue_enabled ?? false,
  );
  const [interestFreeDays, setInterestFreeDays] = useState<string>(
    initialDraft.interest_free_period_days != null
      ? String(initialDraft.interest_free_period_days)
      : "28",
  );
  const [interestFreeInvalid, setInterestFreeInvalid] = useState(false);
  const [annualRatePct, setAnnualRatePct] = useState<string>(
    initialDraft.annual_interest_rate_percent != null
      ? String(initialDraft.annual_interest_rate_percent)
      : "",
  );
  const [annualRateInvalid, setAnnualRateInvalid] = useState(false);

  const [arrearsThresholdDollars, setArrearsThresholdDollars] = useState<string>(
    initialDraft.arrears_action_threshold_cents != null
      ? String(initialDraft.arrears_action_threshold_cents / 100)
      : "50",
  );
  const [arrearsInvalid, setArrearsInvalid] = useState(false);

  const [pending, setPending] = useState(false);

  // Live "First levy due" line. Recomputes whenever FY, freq, or the saved
  // management start date changes. management_start_date lives on Step 1; if
  // the manager hasn't typed it yet (legacy resumed draft) we fall back to
  // "—" so we never show an arbitrary "first levy" anchored to nothing.
  const firstLevyDate = useMemo(() => {
    const msd = initialDraft.manager_appointment_date;
    if (!msd) return null;
    return nextLevyDue(fyMonth, levyFreq, msd);
  }, [fyMonth, levyFreq, initialDraft.manager_appointment_date]);

  async function onContinue() {
    const problems: string[] = [];

    const earlyN = parseFloat(earlyPaymentPct);
    if (!Number.isFinite(earlyN) || earlyN < 0 || earlyN > 100) {
      problems.push("Early payment incentive must be between 0% and 100%.");
      setEarlyPaymentInvalid(true);
    } else {
      setEarlyPaymentInvalid(false);
    }

    let interestFreeN = 28;
    let annualRateN = 0;
    if (interestEnabled) {
      const ifn = parseInt(interestFreeDays, 10);
      if (!Number.isFinite(ifn) || ifn < 28 || ifn > 365) {
        problems.push("Interest-free period must be between 28 and 365 days.");
        setInterestFreeInvalid(true);
      } else {
        interestFreeN = ifn;
        setInterestFreeInvalid(false);
      }
      const rn = parseFloat(annualRatePct);
      if (!Number.isFinite(rn) || rn <= 0 || rn > 100) {
        problems.push("Annual interest rate must be greater than 0% and at most 100%.");
        setAnnualRateInvalid(true);
      } else {
        annualRateN = rn;
        setAnnualRateInvalid(false);
      }
    } else {
      setInterestFreeInvalid(false);
      setAnnualRateInvalid(false);
    }

    const thresholdDollars = parseFloat(arrearsThresholdDollars);
    if (!Number.isFinite(thresholdDollars) || thresholdDollars < 0) {
      problems.push("Arrears action threshold must be $0 or greater.");
      setArrearsInvalid(true);
    } else {
      setArrearsInvalid(false);
    }

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await saveStep(draftId, {
      financial_year_start_month: fyMonth,
      financial_year_start_day: 1,
      billing_cycle: levyFreq,
      levy_calculation_basis: basis,
      early_payment_incentive_percent: earlyN,
      interest_on_overdue_enabled: interestEnabled,
      annual_interest_rate_percent: interestEnabled ? annualRateN : 0,
      interest_free_period_days: interestFreeN,
      arrears_action_threshold_cents: Math.round(thresholdDollars * 100),
    }, 2, 1); // Advance to Step 2.1 (Comms default).
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  const interestFreeNum = parseInt(interestFreeDays, 10);
  const showInterestFreeWarn = interestEnabled && Number.isFinite(interestFreeNum) && interestFreeNum > 90;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fy-start">
                Financial year start month <span className="text-destructive">*</span>
              </Label>
              <Select value={String(fyMonth)} onValueChange={(v) => setFyMonth(parseInt(v ?? "7", 10))}>
                <SelectTrigger id="fy-start" className="w-full">
                  <SelectValue placeholder="Pick a month">
                    {MONTHS.find((m) => m.value === fyMonth)?.label ?? "Pick a month"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="levy-freq">
                Levy frequency <span className="text-destructive">*</span>
              </Label>
              <Select value={levyFreq} onValueChange={(v) => setLevyFreq((v as LevyFrequency) ?? "quarterly")}>
                <SelectTrigger id="levy-freq" className="w-full">
                  <SelectValue placeholder="Pick a frequency">
                    {LEVY_FREQUENCIES.find((f) => f.value === levyFreq)?.label ?? "Pick a frequency"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEVY_FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live "first levy due" line. Reads management start from the saved
              draft — Step 1 just persisted it. */}
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">First levy due:</span>{" "}
            <span className="tabular-nums">{formatLevyDueDisplay(firstLevyDate)}</span>
            {!firstLevyDate && (
              <span className="ml-2 text-xs text-muted-foreground">(set management start date on Step 1)</span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="levy-basis">
              Levy calculation basis <span className="text-destructive">*</span>
            </Label>
            <Select value={basis} onValueChange={(v) => setBasis((v as LevyBasis) ?? "lot_liability")}>
              <SelectTrigger id="levy-basis" className="w-full">
                <SelectValue>{LEVY_BASIS.find((b) => b.value === basis)?.label ?? "Pick a basis"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LEVY_BASIS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {basis === "custom_apportionment" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mt-2">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-900">
                    <strong>Per-lot percentage editor coming soon.</strong> We&apos;ll save Custom apportionment as the basis; set the per-lot percentages from <em>Settings → Financial</em> once the editor ships.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="early-payment">
                Early payment incentive <span className="text-destructive">*</span>
              </Label>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label="Early payment incentive explained" className="text-muted-foreground hover:text-foreground cursor-help">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  }
                />
                <TooltipContent>Discount applied when a lot owner pays on or before the due date.</TooltipContent>
              </Tooltip>
            </div>
            <NumberInput
              id="early-payment"
              value={earlyPaymentPct}
              onChange={(v) => { setEarlyPaymentPct(v); if (earlyPaymentInvalid) setEarlyPaymentInvalid(false); }}
              suffix="%"
              invalid={earlyPaymentInvalid}
              placeholder="0"
            />
          </div>

          {/* Interest toggle. When OFF, the sub-fields are hidden entirely. */}
          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">
                Interest on overdue levies <span className="text-destructive">*</span>
              </p>
              <button
                type="button"
                onClick={() => setInterestEnabled((v) => !v)}
                className={`flex items-center justify-between rounded-md border px-3 h-9 cursor-pointer transition-colors min-w-[140px] ${
                  interestEnabled ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                }`}
              >
                <span className="text-sm">{interestEnabled ? "Yes" : "No"}</span>
                <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${interestEnabled ? "bg-primary" : "bg-border"}`}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${interestEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
              </button>
            </div>

            {interestEnabled && (
              <div className="grid grid-cols-2 gap-4 border-t border-border pt-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="interest-free">
                      Interest-free period <span className="text-destructive">*</span>
                    </Label>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button type="button" aria-label="Interest-free period explained" className="text-muted-foreground hover:text-foreground cursor-help">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                      <TooltipContent>Days after the levy due date before interest starts accruing.</TooltipContent>
                    </Tooltip>
                  </div>
                  <NumberInput
                    id="interest-free"
                    allowDecimal={false}
                    value={interestFreeDays}
                    onChange={(v) => { setInterestFreeDays(v); if (interestFreeInvalid) setInterestFreeInvalid(false); }}
                    suffix="days"
                    invalid={interestFreeInvalid}
                    placeholder="28"
                  />
                  {showInterestFreeWarn && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Most OCs use 28–60 days. Are you sure?</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="annual-rate">
                      Interest rate <span className="text-destructive">*</span>
                    </Label>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button type="button" aria-label="Interest rate explained" className="text-muted-foreground hover:text-foreground cursor-help">
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        }
                      />
                      <TooltipContent>Annual rate charged on unpaid levies once the interest-free period ends.</TooltipContent>
                    </Tooltip>
                  </div>
                  <NumberInput
                    id="annual-rate"
                    value={annualRatePct}
                    onChange={(v) => { setAnnualRatePct(v); if (annualRateInvalid) setAnnualRateInvalid(false); }}
                    suffix="per year"
                    invalid={annualRateInvalid}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="arrears-threshold">
                Arrears action threshold <span className="text-destructive">*</span>
              </Label>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label="Arrears action threshold explained" className="text-muted-foreground hover:text-foreground cursor-help">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  }
                />
                <TooltipContent>The smallest unpaid balance that triggers reminders. Smaller debts are ignored but still tracked.</TooltipContent>
              </Tooltip>
            </div>
            <NumberInput
              id="arrears-threshold"
              thousandsSeparator
              prefix="$"
              value={arrearsThresholdDollars}
              onChange={(v) => { setArrearsThresholdDollars(v); if (arrearsInvalid) setArrearsInvalid(false); }}
              invalid={arrearsInvalid}
              placeholder="50"
            />
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
          <Button type="button" onClick={onContinue} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
