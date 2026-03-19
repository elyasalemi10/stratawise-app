"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Users,
  Award,
  Activity,
  MoreHorizontal,
  Pencil,
  FileText,
  Shield,
  Settings,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ManageContentProps {
  subdivision: {
    id: string;
    name: string;
    address: string;
    plan_number: string;
    status: string;
    oc_tier: number | null;
    total_lots: number;
    common_property_description: string | null;
    rules_type: string;
    financial_year_start_month: number;
    billing_cycle: string;
    is_developer_period: boolean;
    subdivision_type?: string;
  };
  stats: {
    totalLots: number;
    ownersAssigned: number;
    totalMembers: number;
  };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const BILLING_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  annually: "Annually",
};

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "lots", label: "Lots & Owners" },
  { value: "financials", label: "Financials" },
  { value: "meetings", label: "Meetings" },
  { value: "documents", label: "Documents" },
  { value: "compliance", label: "Compliance" },
  { value: "communications", label: "Communications" },
];

function KPICard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {value}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">
        {value || "—"}
      </span>
    </div>
  );
}

function OverviewTab({ subdivision }: { subdivision: ManageContentProps["subdivision"] }) {
  const fyMonth = MONTHS[(subdivision.financial_year_start_month ?? 7) - 1] ?? "July";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">General details</h3>
          <InfoRow label="Plan number" value={subdivision.plan_number} />
          <InfoRow label="Type" value={subdivision.subdivision_type ?? "Strata"} />
          <InfoRow label="Address" value={subdivision.address} />
          <InfoRow label="OC Tier" value={subdivision.oc_tier ? `Tier ${subdivision.oc_tier}` : null} />
          <InfoRow label="Total lots" value={String(subdivision.total_lots)} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Financial settings</h3>
          <InfoRow label="Financial year starts" value={fyMonth} />
          <InfoRow label="Billing cycle" value={BILLING_LABELS[subdivision.billing_cycle] ?? subdivision.billing_cycle} />
          <InfoRow label="Rules type" value={subdivision.rules_type === "model" ? "Model rules" : "Custom rules"} />
          <InfoRow label="Developer period" value={subdivision.is_developer_period ? "Yes" : "No"} />
        </CardContent>
      </Card>

      {subdivision.common_property_description && (
        <Card className="lg:col-span-2">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Common property description</h3>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {subdivision.common_property_description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlaceholderTab({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">
          {name} will be available here soon.
        </p>
      </CardContent>
    </Card>
  );
}

export function ManageContent({ subdivision, stats }: ManageContentProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(
      null,
      "",
      `/subdivisions/${subdivision.id}/manage?tab=${value}`
    );
  }

  const statusVariant = subdivision.status === "active" ? "success" : "neutral";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {subdivision.name}
            </h1>
            <Badge variant={statusVariant}>
              {subdivision.status}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subdivision.address}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm">
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
          <SimpleDropdown
            trigger={
              <Button variant="secondary" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
          >
            <DropdownItem icon={<FileText className="h-4 w-4" />} label="View plan" />
            <DropdownItem icon={<Shield className="h-4 w-4" />} label="Compliance" />
            <DropdownItem icon={<Settings className="h-4 w-4" />} label="Settings" />
          </SimpleDropdown>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          label="OC Tier"
          value={subdivision.oc_tier ? `Tier ${subdivision.oc_tier}` : "—"}
          icon={<Award className="h-5 w-5" />}
        />
        <KPICard
          label="Total lots"
          value={String(stats.totalLots)}
          icon={<Building2 className="h-5 w-5" />}
        />
        <KPICard
          label="Owners assigned"
          value={`${stats.ownersAssigned} of ${stats.totalLots}`}
          icon={<Users className="h-5 w-5" />}
        />
        <KPICard
          label="Status"
          value={subdivision.status === "active" ? "Active" : subdivision.status}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab content — all rendered, hidden via CSS */}
      <div className={activeTab === "overview" ? "" : "hidden"}>
        <OverviewTab subdivision={subdivision} />
      </div>
      <div className={activeTab === "lots" ? "" : "hidden"}>
        <PlaceholderTab name="Lots & Owners" />
      </div>
      <div className={activeTab === "financials" ? "" : "hidden"}>
        <PlaceholderTab name="Financials" />
      </div>
      <div className={activeTab === "meetings" ? "" : "hidden"}>
        <PlaceholderTab name="Meetings" />
      </div>
      <div className={activeTab === "documents" ? "" : "hidden"}>
        <PlaceholderTab name="Documents" />
      </div>
      <div className={activeTab === "compliance" ? "" : "hidden"}>
        <PlaceholderTab name="Compliance" />
      </div>
      <div className={activeTab === "communications" ? "" : "hidden"}>
        <PlaceholderTab name="Communications" />
      </div>
    </div>
  );
}

// ─── Simple dropdown (reuse pattern from sidebar) ───────────────

import { useEffect, useRef } from "react";

function SimpleDropdown({
  trigger,
  children,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-40 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground"
    >
      {icon}
      {label}
    </button>
  );
}
