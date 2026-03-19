"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Building2, DollarSign, Users, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText } from "lucide-react";
import { updateLotField } from "../../manage/actions";
import { DocumentManager } from "@/components/shared/document-manager";
import type { DocumentRecord } from "@/lib/validations/documents";

interface LotDetailContentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lot: any;
  subdivisionId: string;
  balance: number;
  documents: DocumentRecord[];
}

const TABS = [
  { value: "general", label: "General" },
  { value: "documents", label: "Documents" },
  { value: "payments", label: "Payments" },
  { value: "levies", label: "Levies" },
  { value: "communications", label: "Communications" },
];

// ─── Editable info row ──────────────────────────────────────────

function EditableInfoRow({
  label,
  value,
  field,
  lotId,
  subdivisionId,
  isEditing,
  type = "text",
  options,
  onSaved,
}: {
  label: string;
  value: string | null;
  field: string;
  lotId: string;
  subdivisionId: string;
  isEditing: boolean;
  type?: "text" | "select";
  options?: { value: string; label: string }[];
  onSaved?: (v: string) => void;
}) {
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value ?? "");
  }, [value, isEditing]);

  const save = useCallback(async () => {
    if (editValue === (value ?? "")) return;
    const result = await updateLotField(subdivisionId, lotId, field, editValue || null);
    if (result.error) {
      toast.error(result.error);
      setEditValue(value ?? "");
    } else {
      onSaved?.(editValue);
    }
  }, [editValue, value, subdivisionId, lotId, field, onSaved]);

  if (!isEditing) {
    let displayValue = value || "—";
    if (options) displayValue = options.find((o) => o.value === value)?.label ?? displayValue;
    return (
      <div className="flex items-start justify-between py-3 border-b border-border last:border-b-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{displayValue}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 max-w-[60%]">
        {type === "select" && options ? (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={save}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                save();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-8 text-sm"
          />
        )}
      </div>
    </div>
  );
}

// ─── Placeholder tab ────────────────────────────────────────────

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

// ─── Main component ─────────────────────────────────────────────

export function LotDetailContent({ lot: initialLot, subdivisionId, balance, documents }: LotDetailContentProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "general";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isEditing, setIsEditing] = useState(false);
  const [lot, setLot] = useState(initialLot);

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `/subdivisions/${subdivisionId}/lots/${lot.id}?tab=${value}`);
  }

  function onFieldSaved(field: string, value: string) {
    setLot((prev: typeof lot) => ({ ...prev, [field]: value }));
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

  const hasOwner = !!lot.owner_name;
  const statusVariant = !hasOwner ? "neutral" : balance > 0 ? "destructive" : "success";
  const statusLabel = !hasOwner ? "Unassigned" : balance > 0 ? "Behind" : "Up to date";

  const ownerTypeOptions = [
    { value: "individual", label: "Individual" },
    { value: "company", label: "Company" },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/subdivisions/${subdivisionId}/manage?tab=lots`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Lots
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {lot.owner_name ?? `Lot ${lot.lot_number}`}
            </h1>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Lot {lot.lot_number}{lot.unit_number ? ` · Unit ${lot.unit_number}` : ""}
          </p>
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
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lot number</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{lot.lot_number}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entitlement</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {Number(lot.lot_entitlement) || "—"}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</p>
                <p className={`mt-2 text-2xl font-bold tabular-nums ${balance > 0 ? "text-destructive" : "text-[hsl(160,100%,37%)]"}`}>
                  {formatCurrency(balance)}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
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
      <div className={activeTab === "general" ? "" : "hidden"}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Lot details</h3>
              <EditableInfoRow label="Lot number" value={String(lot.lot_number)} field="lot_number" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("lot_number", v)} />
              <EditableInfoRow label="Unit number" value={lot.unit_number} field="unit_number" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("unit_number", v)} />
              <EditableInfoRow label="Entitlement" value={lot.lot_entitlement ? String(lot.lot_entitlement) : null} field="lot_entitlement" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("lot_entitlement", v)} />
              <EditableInfoRow label="Liability" value={lot.lot_liability ? String(lot.lot_liability) : null} field="lot_liability" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("lot_liability", v)} />
              {/* Owner occupied toggle */}
              <div className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                <span className="text-sm text-muted-foreground">Owner occupied</span>
                {isEditing ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const newVal = !(lot.owner_occupied ?? true);
                      const result = await updateLotField(subdivisionId, lot.id, "owner_occupied", newVal);
                      if (!result.error) onFieldSaved("owner_occupied", String(newVal));
                    }}
                    className="cursor-pointer"
                  >
                    <Badge variant={(lot.owner_occupied ?? true) ? "success" : "neutral"}>
                      {(lot.owner_occupied ?? true) ? "Yes" : "No"}
                    </Badge>
                  </button>
                ) : (
                  <Badge variant={(lot.owner_occupied ?? true) ? "success" : "neutral"}>
                    {(lot.owner_occupied ?? true) ? "Yes" : "No"}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Owner details</h3>
              <EditableInfoRow label="Name" value={lot.owner_name} field="owner_name" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("owner_name", v)} />
              <EditableInfoRow label="Type" value={lot.owner_type ?? "individual"} field="owner_type" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} type="select" options={ownerTypeOptions} onSaved={(v) => onFieldSaved("owner_type", v)} />
              <EditableInfoRow label="Email" value={lot.owner_email} field="owner_email" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("owner_email", v)} />
              <EditableInfoRow label="Phone" value={lot.owner_phone} field="owner_phone" lotId={lot.id} subdivisionId={subdivisionId} isEditing={isEditing} onSaved={(v) => onFieldSaved("owner_phone", v)} />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentManager subdivisionId={subdivisionId} lotId={lot.id} initialDocuments={documents} />
      </div>

      <div className={activeTab === "payments" ? "" : "hidden"}>
        <PlaceholderTab name="Payments" />
      </div>
      <div className={activeTab === "levies" ? "" : "hidden"}>
        <PlaceholderTab name="Levies" />
      </div>
      <div className={activeTab === "communications" ? "" : "hidden"}>
        <PlaceholderTab name="Communications" />
      </div>
    </div>
  );
}
