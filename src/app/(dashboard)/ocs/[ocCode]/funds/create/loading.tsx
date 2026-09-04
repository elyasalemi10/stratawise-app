import { Building2, MoreHorizontal, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FUND_KIND_LABEL } from "@/lib/funds-shared";
import { StepIndicator } from "./create-fund-form";

// No shimmer. Step 1 of the wizard is the fund-type picker, and all of it
// (the step strip, the label, the three choice cards) is fixed copy. The
// server data only decides which of the three are already taken, which is a
// disabled state, not content.
//
// It previously rendered a two-column Lot / Liability table skeleton , a
// screen that belongs to step 2.

const CHOICES = [
  {
    label: FUND_KIND_LABEL.admin,
    icon: Building2,
    blurb: "Day-to-day OC running costs , insurance, cleaning, admin, manager fees.",
  },
  {
    label: "Other (custom fund)",
    icon: MoreHorizontal,
    blurb: "A purpose-specific fund , e.g. driveway, pool, lift modernisation.",
  },
];

export default function Loading() {
  return (
    <div className="space-y-6">
      <StepIndicator current="kind" />

      <Card>
        <CardContent className="space-y-4 pt-5">
          <Label>
            Fund type <span className="text-destructive">*</span>
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {CHOICES.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="flex h-full flex-col items-start gap-2 rounded-md border border-border bg-card p-4 text-left"
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <div className="text-sm font-medium text-foreground">{c.label}</div>
                  <p className="text-xs text-muted-foreground">{c.blurb}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
