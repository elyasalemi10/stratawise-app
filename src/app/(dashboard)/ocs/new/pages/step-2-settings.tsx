"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
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
import { WizardActions } from "./_components/wizard-actions";
import { nextLevyDue, formatLevyDueDisplay, type LevyFrequency } from "@/lib/levy-cadence";

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

const LEVY_FREQUENCIES: Array<{ value: LevyFrequency; label: string }> = [
  { value: "annually",    label: "Annually (1)" },
  { value: "half_yearly", label: "Half-yearly (2)" },
  { value: "quarterly",   label: "Quarterly (4)" },
  { value: "monthly",     label: "Monthly (12)" },
];

const LEVY_BASIS = [
  { value: "lot_liability", label: "Lot liability (standard)" },
  { value: "equal_per_lot", label: "Equal per lot" },
  { value: "custom_apportionment", label: "Custom apportionment" },
] as const;
type LevyBasis = typeof LEVY_BASIS[number]["value"];

function InlineYesNoToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  // Toggle circle on the LEFT, Yes/No text on the right , matches Step 1.
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`inline-flex items-center gap-2.5 rounded-md border px-3 h-9 cursor-pointer transition-colors w-[120px] ${
        value ? "border-primary bg-primary/5 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40"
      }`}
    >
      <span className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-border"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </span>
      <span className="text-sm">{value ? "Yes" : "No"}</span>
    </button>
  );
}

export function Step2Settings({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: (patch?: Partial<DraftJson>) => void;
}) {
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [levyFreq, setLevyFreq] = useState<LevyFrequency>(
    (initialDraft.billing_cycle as LevyFrequency | undefined) ?? "quarterly",
  );

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

  const [pending, setPending] = useState(false);

  async function onContinue() {
    const problems: string[] = [];

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

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    // Background save , advance instantly, surface errors via toast.
    // The WizardActions auto-save heartbeat backstops any dropped write.
    const patch = {
      financial_year_start_month: fyMonth,
      financial_year_start_day: 1,
      billing_cycle: levyFreq,
      interest_on_overdue_enabled: interestEnabled,
      annual_interest_rate_percent: interestEnabled ? annualRateN : 0,
      interest_free_period_days: interestFreeN,
    };
    void saveStep(draftId, patch, 3, 0).then((r) => {
      if (r.error) toast.error(r.error);
    });
    onNext(patch);
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
                  <SelectValue>{MONTHS.find((m) => m.value === fyMonth)?.label ?? "Pick a month"}</SelectValue>
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
                  <SelectValue>{LEVY_FREQUENCIES.find((f) => f.value === levyFreq)?.label ?? "Pick a frequency"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEVY_FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* (First levy due helper removed per item 7 , derivable from
              the FY + cadence later and was creating noise at setup time.) */}

          {/* Levy calculation basis + early payment incentive moved out of
              OC creation per item 8 , both are now configurable from the
              per-OC Settings → Financial page after creation. Defaults
              (lot_liability / 0%) cover the vast majority of OCs at sign-up. */}

          {/* Interest on overdue , inline-toggle row (no card). Label and
              toggle sit beside each other on the left (matches the GST row
              on Step 1) rather than being split across the full width. */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label>
                Interest on overdue levies <span className="text-destructive">*</span>
              </Label>
              <InlineYesNoToggle value={interestEnabled} onChange={setInterestEnabled} />
            </div>
            {interestEnabled && (
              <div className="grid grid-cols-2 gap-4">
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
                    placeholder="Days"
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
                  <div className="flex items-center gap-2">
                    <NumberInput
                      id="annual-rate"
                      value={annualRatePct}
                      onChange={(v) => { setAnnualRatePct(v); if (annualRateInvalid) setAnnualRateInvalid(false); }}
                      suffix="%"
                      invalid={annualRateInvalid}
                      placeholder="Rate"
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">per year</span>
                  </div>
                </div>
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
            const annualRateParsed = parseFloat(annualRatePct);
            const interestFreeParsed = parseInt(interestFreeDays, 10);
            return {
              financial_year_start_month: fyMonth,
              financial_year_start_day: 1,
              billing_cycle: levyFreq,
              interest_on_overdue_enabled: interestEnabled,
              annual_interest_rate_percent: interestEnabled && Number.isFinite(annualRateParsed) ? annualRateParsed : 0,
              interest_free_period_days: Number.isFinite(interestFreeParsed) ? interestFreeParsed : undefined,
            };
          }}
        />
      </div>
    </TooltipProvider>
  );
}
