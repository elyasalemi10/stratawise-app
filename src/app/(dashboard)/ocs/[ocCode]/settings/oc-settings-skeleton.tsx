import { Pencil, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors management-card.tsx + settings-content.tsx (General tab).
//
// Almost nothing on this page is server data. The five tab labels, all three
// card titles, both Edit affordances, the Transfer button and every single
// field label are fixed, so they all render for real. Only the VALUES
// shimmer, which on arrival is the only thing that changes.
//
// The previous version was two generic cards of grey bars with a tab strip
// styled like the lot-detail one (gold underline, centred, min-width tabs).
// The real strip is left-aligned h-9 buttons with a primary bottom border,
// and the General tab is a two-column grid, so the whole frame moved when
// the data landed.
//
// Keep TABS and the field labels in step with settings-content.tsx.

const TABS = ["General", "Financial", "Communications", "Banking", "Automation"];

const GENERAL_FIELDS = [
  "Name",
  "Plan number",
  "Address",
  "ABN",
  "TFN",
  "OC Tier",
  "Total lots",
];

const CERTIFICATE_FIELDS = ["Common seal text", "Inspection address"];

function FieldRow({ label, width }: { label: string; width: string }) {
  return (
    <div className="flex items-start justify-between border-b border-border/50 py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Skeleton className={`mt-0.5 h-3.5 ${width}`} />
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Button variant="secondary" size="sm" disabled>
        <Pencil className="mr-1.5 h-3.5 w-3.5" />
        Edit
      </Button>
    </div>
  );
}

// Varied widths so the column reads as data rather than a grid.
const GENERAL_WIDTHS = ["w-44", "w-28", "w-56", "w-32", "w-24", "w-16", "w-10"];

export function OCSettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Management card , sits above the tabs on the real page. */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Management</h3>
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Current agency</p>
              <Skeleton className="mt-1.5 h-5 w-52" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
            <Button variant="secondary" size="sm" disabled>
              <Repeat className="mr-2 h-3.5 w-3.5" />
              Transfer
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-1">
            {TABS.map((label, i) => (
              <span
                key={label}
                className={`h-9 border-b-2 px-3 text-sm font-medium leading-9 ${
                  i === 0
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <CardHeader title="General details" />
              {GENERAL_FIELDS.map((label, i) => (
                <FieldRow key={label} label={label} width={GENERAL_WIDTHS[i]} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <CardHeader title="Certificate settings" />
              {CERTIFICATE_FIELDS.map((label, i) => (
                <FieldRow key={label} label={label} width={i === 0 ? "w-36" : "w-48"} />
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <CardHeader title="Common property description" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
