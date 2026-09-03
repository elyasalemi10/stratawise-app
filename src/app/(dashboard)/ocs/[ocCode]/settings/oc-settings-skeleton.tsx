import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { OCSettingsSection } from "./nav";

// Mirrors settings-content.tsx, one section at a time.
//
// Almost nothing on this page is server data. Every card title and every
// field LABEL is fixed, so they render for real. Only the VALUES shimmer,
// which on arrival is the only thing that changes.
//
// Keep the field lists in step with settings-content.tsx.

function FieldSkeleton({ label, wide }: { label: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}

function ToggleSkeleton({ label }: { label: string }) {
  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-3 py-2">
        <Label className="font-normal">{label}</Label>
        <Skeleton className="h-5 w-9 rounded-full" />
      </div>
    </div>
  );
}

function FieldCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
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
      <FieldCard title="Financial settings">
        <FieldSkeleton label="Financial year starts" />
        <FieldSkeleton label="Billing cycle" />
        <FieldSkeleton label="Rules type" />
        <FieldSkeleton label="Levy calculation basis" />
        <FieldSkeleton label="Early payment incentive" />
        <FieldSkeleton label="Annual interest rate" />
        <FieldSkeleton label="Interest-free period" />
        <FieldSkeleton label="Arrears action threshold" />
        <ToggleSkeleton label="Include arrears on levy notices" />
      </FieldCard>
    );
  }

  if (section === "communications") {
    return (
      <div className="space-y-6">
        <FieldCard title="Delivery">
          <FieldSkeleton label="Default delivery method" />
          <FieldSkeleton label="Meetings postal buffer" />
          <FieldSkeleton label="Levies postal buffer" />
          <FieldSkeleton label="Financial documents postal buffer" />
        </FieldCard>
        <FieldCard title="Levy notice content">
          <ToggleSkeleton label="Add note for multi-lot owners" />
        </FieldCard>
      </div>
    );
  }

  if (section === "banking") {
    return (
      <FieldCard title="Trust account details">
        <FieldSkeleton label="Account name" wide />
        <FieldSkeleton label="BSB" />
        <FieldSkeleton label="Account number" />
      </FieldCard>
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
          <div className="flex items-center justify-between border-b border-border/50 py-3 last:border-b-0">
            <span className="text-sm text-foreground">Auto-send levies</span>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // general
  return (
    <div className="space-y-6">
      <FieldCard title="General details">
        <FieldSkeleton label="Name" />
        <FieldSkeleton label="Plan number" />
        <FieldSkeleton label="Address" wide />
        <FieldSkeleton label="ABN" />
        <FieldSkeleton label="TFN" />
        <FieldSkeleton label="OC Tier" />
        <FieldSkeleton label="Total lots" />
      </FieldCard>
      <FieldCard title="Certificate settings">
        <FieldSkeleton label="Common seal text" wide />
        <FieldSkeleton label="Inspection address" wide />
      </FieldCard>
      <FieldCard title="Common property description">
        <FieldSkeleton label="Common property description" wide />
      </FieldCard>
    </div>
  );
}
