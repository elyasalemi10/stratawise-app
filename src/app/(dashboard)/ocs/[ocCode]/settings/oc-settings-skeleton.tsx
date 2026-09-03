import { Pencil, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OCSettingsSection } from "./nav";

// Mirrors settings-content.tsx, one section at a time.
//
// Almost nothing on this page is server data. Every card title, every Edit
// affordance and every field LABEL is fixed, so they all render for real.
// Only the VALUES shimmer, which on arrival is the only thing that changes.
//
// Keep the field lists in step with settings-content.tsx.

function FieldRow({ label, width }: { label: string; width: string }) {
  return (
    <div className="flex items-start justify-between border-b border-border/50 py-2.5 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Skeleton className={`mt-0.5 h-3.5 ${width}`} />
    </div>
  );
}

function CardTitleRow({ title }: { title: string }) {
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

// Varied widths so a column reads as data rather than a grid.
const WIDTHS = ["w-44", "w-28", "w-56", "w-32", "w-24", "w-16", "w-40", "w-20"];

function FieldCard({
  title,
  fields,
  className,
}: {
  title: string;
  fields: string[];
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-5">
        <CardTitleRow title={title} />
        {fields.map((label, i) => (
          <FieldRow key={label} label={label} width={WIDTHS[i % WIDTHS.length]} />
        ))}
      </CardContent>
    </Card>
  );
}

export function OCSettingsSkeleton({ section }: { section: OCSettingsSection }) {
  if (section === "management") {
    return (
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
    );
  }

  if (section === "financial") {
    return (
      <FieldCard
        title="Financial settings"
        fields={[
          "Financial year starts",
          "Billing cycle",
          "Levy basis",
          "Penalty interest",
          "GST registered",
        ]}
      />
    );
  }

  if (section === "communications") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldCard title="Delivery" fields={["Default delivery", "Reply-to address"]} />
        <FieldCard title="Levy notice content" fields={["Notice footer", "Payment instructions"]} />
      </div>
    );
  }

  if (section === "banking") {
    return (
      <FieldCard
        title="Trust account details"
        fields={["Bank", "Account name", "BSB", "Account number"]}
      />
    );
  }

  if (section === "automation") {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Automations</h3>
            <Skeleton className="h-8 w-36 rounded-md" />
          </div>
          {["Auto-send levies"].map((label) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-border/50 py-3 last:border-b-0"
            >
              <span className="text-sm text-foreground">{label}</span>
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // general
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <FieldCard
        title="General details"
        fields={["Name", "Plan number", "Address", "ABN", "TFN", "OC Tier", "Total lots"]}
      />
      <FieldCard
        title="Certificate settings"
        fields={["Common seal text", "Inspection address"]}
      />
      <Card className="lg:col-span-2">
        <CardContent className="pt-5">
          <CardTitleRow title="Common property description" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="mt-2 h-3.5 w-1/2" />
        </CardContent>
      </Card>
    </div>
  );
}
