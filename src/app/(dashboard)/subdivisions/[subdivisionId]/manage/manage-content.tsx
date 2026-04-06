"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LotsTab } from "./lots-tab";
import { updateSubdivisionField } from "./actions";
import { DocumentManager } from "@/components/shared/document-manager";
import type { LotWithFinancials } from "@/lib/actions/subdivision";
import type { DocumentRecord } from "@/lib/validations/documents";

interface ManageContentProps {
  lots: LotWithFinancials[];
  documents: DocumentRecord[];
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
    abn?: string | null;
    tfn?: string | null;
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

const TYPE_LABELS: Record<string, string> = {
  strata: "Strata Plan",
  company: "Company Plan",
  neighbourhood_association: "Neighbourhood Association",
};

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "lots", label: "Lots & Owners" },
  { value: "financials", label: "Financials" },
  { value: "meetings", label: "Meetings" },
  { value: "documents", label: "Documents" },
];

// ─── Inline editable field ──────────────────────────────────────

function EditableField({
  label,
  value,
  field,
  subdivisionId,
  isEditing,
  type = "text",
  options,
  onSaved,
}: {
  label: string;
  value: string | null | undefined;
  field: string;
  subdivisionId: string;
  isEditing: boolean;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  onSaved?: (newValue: string) => void;
}) {
  const [editValue, setEditValue] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    setEditValue(value ?? "");
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const save = useCallback(async () => {
    if (editValue === (value ?? "")) return;
    setSaving(true);
    const result = await updateSubdivisionField(subdivisionId, field, editValue || null);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      setEditValue(value ?? "");
    } else {
      onSaved?.(editValue);
    }
  }, [editValue, value, subdivisionId, field, onSaved]);

  if (!isEditing) {
    // Display mode
    let displayValue = value || "—";
    if (options) {
      displayValue = options.find((o) => o.value === value)?.label ?? displayValue;
    }
    return (
      <div className="flex items-start justify-between py-3 border-b border-border last:border-b-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground text-right max-w-[60%]">
          {displayValue}
        </span>
      </div>
    );
  }

  // Edit mode
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 max-w-[60%]">
        {type === "select" && options ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={save}
            disabled={saving}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={save}
            disabled={saving}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
                (e.target as HTMLInputElement).blur();
              }
            }}
            disabled={saving}
            className="h-8 text-sm"
          />
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────

function KPICard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────

function OverviewTab({
  subdivision,
  isEditing,
  onFieldSaved,
}: {
  subdivision: ManageContentProps["subdivision"];
  isEditing: boolean;
  onFieldSaved: (field: string, value: string) => void;
}) {
  const fyMonth = MONTHS[(subdivision.financial_year_start_month ?? 7) - 1] ?? "July";
  const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
  const typeOptions = [
    { value: "strata", label: "Strata Plan" },
    { value: "company", label: "Company Plan" },
    { value: "neighbourhood_association", label: "Neighbourhood Association" },
  ];
  const billingOptions = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "half_yearly", label: "Half-yearly" },
    { value: "annually", label: "Annually" },
  ];
  const rulesOptions = [
    { value: "model", label: "Model rules" },
    { value: "custom", label: "Custom rules" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">General details</h3>
          <EditableField label="Name" value={subdivision.name} field="name" subdivisionId={subdivision.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("name", v)} />
          <EditableField label="Plan number" value={subdivision.plan_number} field="plan_number" subdivisionId={subdivision.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("plan_number", v)} />
          <EditableField label="Type" value={subdivision.subdivision_type ?? "strata"} field="subdivision_type" subdivisionId={subdivision.id} isEditing={isEditing} type="select" options={typeOptions} onSaved={(v) => onFieldSaved("subdivision_type", v)} />
          <EditableField label="Address" value={subdivision.address} field="address" subdivisionId={subdivision.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("address", v)} />
          {isEditing && (
            <>
              <EditableField label="ABN" value={subdivision.abn ?? ""} field="abn" subdivisionId={subdivision.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("abn", v)} />
              <EditableField label="TFN" value={subdivision.tfn ?? ""} field="tfn" subdivisionId={subdivision.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("tfn", v)} />
            </>
          )}
          {!isEditing && (
            <>
              <EditableField label="OC Tier" value={subdivision.oc_tier ? `Tier ${subdivision.oc_tier}` : null} field="" subdivisionId={subdivision.id} isEditing={false} />
              <EditableField label="Total lots" value={String(subdivision.total_lots)} field="" subdivisionId={subdivision.id} isEditing={false} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Financial settings</h3>
          <EditableField label="Financial year starts" value={isEditing ? String(subdivision.financial_year_start_month) : fyMonth} field="financial_year_start_month" subdivisionId={subdivision.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={monthOptions} onSaved={(v) => onFieldSaved("financial_year_start_month", v)} />
          <EditableField label="Billing cycle" value={isEditing ? subdivision.billing_cycle : (BILLING_LABELS[subdivision.billing_cycle] ?? subdivision.billing_cycle)} field="billing_cycle" subdivisionId={subdivision.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={billingOptions} onSaved={(v) => onFieldSaved("billing_cycle", v)} />
          <EditableField label="Rules type" value={isEditing ? subdivision.rules_type : (subdivision.rules_type === "model" ? "Model rules" : "Custom rules")} field="rules_type" subdivisionId={subdivision.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={rulesOptions} onSaved={(v) => onFieldSaved("rules_type", v)} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Common property description</h3>
          {isEditing ? (
            <EditableField label="" value={subdivision.common_property_description} field="common_property_description" subdivisionId={subdivision.id} isEditing={true} type="textarea" onSaved={(v) => onFieldSaved("common_property_description", v)} />
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {subdivision.common_property_description || "No description set."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Placeholder Tab ────────────────────────────────────────────

function PlaceholderTab({ name }: { name: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">{name} will be available here soon.</p>
      </CardContent>
    </Card>
  );
}

// ─── Simple dropdown ────────────────────────────────────────────

function SimpleDropdown({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-40 rounded-lg border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button type="button" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent hover:text-accent-foreground">
      {icon}
      {label}
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────

export function ManageContent({ subdivision: initialSub, stats, lots: initialLots, documents }: ManageContentProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") ?? "overview";
  const [activeTab, setActiveTab] = useState(currentTab);

  // Sync activeTab when URL searchParams change (e.g. sidebar nav clicks)
  useEffect(() => {
    setActiveTab(currentTab);
  }, [currentTab]);
  const [isEditing, setIsEditing] = useState(false);
  const [subdivision, setSubdivision] = useState(initialSub);
  const [lots, setLots] = useState(initialLots);

  // Calculate total units of entitlement from lots
  const totalEntitlement = lots.reduce((sum, lot) => sum + lot.lot_entitlement, 0);

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `/subdivisions/${subdivision.id}/manage?tab=${value}`);
  }

  function onFieldSaved(field: string, value: string) {
    setSubdivision((prev) => ({ ...prev, [field]: value }));
  }

  function onLotUpdated(lotId: string, field: string, value: string | number | null) {
    setLots((prev) =>
      prev.map((lot) =>
        lot.id === lotId
          ? { ...lot, [field]: field === "lot_entitlement" || field === "lot_liability" ? Number(value) || 0 : value }
          : lot
      )
    );
  }

  const statusVariant = subdivision.status === "active" ? "success" : "neutral";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{subdivision.name}</h1>
            <Badge variant={statusVariant}>{subdivision.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subdivision.address}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isEditing ? (
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
              <Check className="mr-2 h-3.5 w-3.5" />
              Done
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
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
        <KPICard label="OC Tier" value={subdivision.oc_tier ? `Tier ${subdivision.oc_tier}` : "—"} icon={<Award className="h-5 w-5" />} />
        <KPICard label="Total lots" value={String(stats.totalLots)} icon={<Building2 className="h-5 w-5" />} />
        <KPICard label="Owners assigned" value={`${stats.ownersAssigned} of ${stats.totalLots}`} icon={<Users className="h-5 w-5" />} />
        <KPICard label="Total entitlement" value={totalEntitlement > 0 ? String(totalEntitlement) : "—"} icon={<Activity className="h-5 w-5" />} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab content */}
      <div className={activeTab === "overview" ? "" : "hidden"}>
        <OverviewTab subdivision={subdivision} isEditing={isEditing} onFieldSaved={onFieldSaved} />
      </div>
      <div className={activeTab === "lots" ? "" : "hidden"}>
        <LotsTab
          lots={lots}
          subdivisionId={subdivision.id}
          isEditing={isEditing}
          onLotUpdated={onLotUpdated}
          totalEntitlement={totalEntitlement}
        />
      </div>
      <div className={activeTab === "financials" ? "" : "hidden"}><PlaceholderTab name="Financials" /></div>
      <div className={activeTab === "meetings" ? "" : "hidden"}><PlaceholderTab name="Meetings" /></div>
      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentManager subdivisionId={subdivision.id} initialDocuments={documents} />
      </div>
    </div>
  );
}
