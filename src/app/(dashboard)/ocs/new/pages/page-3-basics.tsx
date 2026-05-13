"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DatePicker } from "@/components/shared/date-picker";
import { saveStep, type DraftJson } from "../actions";

function tierForLotCount(n: number, servicesOnly: boolean): number {
  if (servicesOnly) return 5;
  if (n >= 100) return 1;
  if (n >= 51) return 2;
  if (n >= 10) return 3;
  if (n >= 3) return 4;
  return 5;
}

function tierColour(t: number): string {
  switch (t) {
    case 1: return "bg-red-100 text-red-900 border-red-300";
    case 2: return "bg-orange-100 text-orange-900 border-orange-300";
    case 3: return "bg-amber-100 text-amber-900 border-amber-300";
    case 4: return "bg-green-100 text-green-900 border-green-300";
    default: return "bg-blue-100 text-blue-900 border-blue-300";
  }
}

// We use a fixed reference year for the FY-start picker so leap-day selection
// doesn't matter — the user is choosing a month + day, not a calendar date.
const FY_REFERENCE_YEAR = 2001; // non-leap
function fyToIso(month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${FY_REFERENCE_YEAR}-${mm}-${dd}`;
}
function isoToFy(iso: string): { month: number; day: number } {
  const [, mm, dd] = iso.split("-");
  return { month: parseInt(mm, 10) || 7, day: parseInt(dd, 10) || 1 };
}

export function Page3Basics({
  draftId,
  initialDraft,
  totalLots,
  onNext,
  onBack,
}: {
  draftId: string;
  initialDraft: DraftJson;
  totalLots: number;
  onNext: () => void;
  onBack: () => void;
}) {
  // Item 9: "Trading name" → "Title" (and remove the descriptive note).
  const [title, setTitle] = useState(initialDraft.trading_name ?? "");
  const [servicesOnly, setServicesOnly] = useState(initialDraft.services_only ?? false);
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [fyDay, setFyDay] = useState<number>(initialDraft.financial_year_start_day ?? 1);
  const [pending, setPending] = useState(false);

  const tier = useMemo(() => tierForLotCount(totalLots, servicesOnly), [totalLots, servicesOnly]);
  const fyIso = fyToIso(fyMonth, fyDay);
  const fyDisplay = useMemo(() => {
    const d = new Date(fyIso + "T00:00:00");
    return format(d, "d MMMM");
  }, [fyIso]);

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, {
      trading_name: title || undefined,
      services_only: servicesOnly,
      financial_year_start_month: fyMonth,
      financial_year_start_day: fyDay,
    }, 4);
    setPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    onNext();
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Tell us about this OC</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A few details that don&apos;t appear on the plan of subdivision.
          </p>
        </div>

        <div className="space-y-4">
          {/* Item 9: Title (was "Trading name"). Note removed. */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-title">
              Title <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="oc-title"
              placeholder="The Grandview Apartments"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Item 10: working tier tooltip (was a plain `title` attribute). */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Tier</span>
                  <Tooltip>
                    <TooltipTrigger
                      aria-label="What is OC tier?"
                      className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      OC tier determines compliance requirements like audit
                      obligations, maintenance plans, and committee size under
                      the Owners Corporations Act 2006. Tier 1 has the most
                      obligations; Tier 5 the fewest.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Auto-calculated from lot count ({totalLots} lots).
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${tierColour(tier)}`}>
                Tier {tier}
              </span>
            </div>
            {/* Items 12: simplified label. */}
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <Checkbox
                id="services-only"
                checked={servicesOnly}
                onCheckedChange={(v) => setServicesOnly(v === true)}
              />
              <Label className="text-sm font-normal">
                This is a services-only OC
              </Label>
            </div>
          </div>

          {/* Item 11: shadcn DatePicker (calendar) for FY start. Year is fixed
              to a non-leap reference; we only persist month+day. Item 13: hint
              removed. */}
          <div className="space-y-1.5">
            <Label>
              Financial year start
            </Label>
            <DatePicker
              value={fyIso}
              onChange={(iso) => {
                const { month, day } = isoToFy(iso);
                setFyMonth(month);
                setFyDay(day);
              }}
              placeholder="Pick the start date"
            />
            <p className="text-xs text-muted-foreground">
              Showing: <span className="font-medium text-foreground">{fyDisplay}</span>. Year is irrelevant — we only store month and day.
            </p>
          </div>

          {/* Item 14: common-seal checkbox removed. Notice address moved to lots step (item 16). */}
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
          <Button type="button" onClick={onContinue} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
