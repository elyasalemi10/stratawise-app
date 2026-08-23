import { Building2, Landmark, Settings2, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// The wizard's four steps are a hardcoded STEPS array in
// step-indicator.tsx, labels and icons both, so the indicator renders for
// real with step 1 active. Only the form contents shimmer.
//
// Mirrors ocs/new/step-indicator.tsx.

const STEPS = [
  { label: "General", Icon: Building2 },
  { label: "Settings", Icon: Settings2 },
  { label: "Lots & Owners", Icon: Users },
  { label: "Banking", Icon: Landmark },
];

export default function NewOCLoading() {
  return (
    <div className="space-y-6">
      <div className="mb-6 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
        {STEPS.map(({ label, Icon }, i) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <div
              className={`flex size-9 items-center justify-center rounded-full border ${
                i === 0
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Icon className="size-4" />
            </div>
            <span
              className={`text-xs font-medium ${
                i === 0 ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
