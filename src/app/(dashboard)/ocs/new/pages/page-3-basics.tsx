"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const [title, setTitle] = useState(initialDraft.trading_name ?? "");
  const [servicesOnly, setServicesOnly] = useState(initialDraft.services_only ?? false);
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [pending, setPending] = useState(false);

  const tier = useMemo(() => tierForLotCount(totalLots, servicesOnly), [totalLots, servicesOnly]);

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, {
      trading_name: title || undefined,
      services_only: servicesOnly,
      financial_year_start_month: fyMonth,
      financial_year_start_day: 1,
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
          {/* Title (was "Trading name"). */}
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

          {/* Tier — shadcn Tooltip with a larger, more legible body. */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Tier</span>
                <Tooltip>
                  <TooltipTrigger
                    aria-label="What is OC tier?"
                    className="inline-flex items-center text-muted-foreground hover:text-foreground cursor-help"
                  >
                    <Info className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm text-sm leading-relaxed">
                    <p className="font-medium text-foreground">OC tier (Owners Corporations Act 2006)</p>
                    <p className="mt-1 text-muted-foreground">
                      Determines compliance requirements: audit obligations, 10-year maintenance
                      plans, and committee size. Tier 1 has the most obligations; Tier 5 the fewest.
                      Calculated from lot count.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${tierColour(tier)}`}>
                Tier {tier}
              </span>
            </div>
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

          {/* Financial year start — month picker. We always anchor to day 1. */}
          <div className="space-y-1.5">
            <Label htmlFor="fy-start">Financial year start</Label>
            <Select
              value={String(fyMonth)}
              onValueChange={(v) => setFyMonth(parseInt(v ?? "7", 10))}
            >
              <SelectTrigger id="fy-start" className="w-full">
                <SelectValue placeholder="Pick a month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
