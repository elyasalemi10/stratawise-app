"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { LedgerTab } from "./lot-ledger-tab";
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
import type { LotOwnerInfo } from "@/lib/actions/lot-ownership";
import { useSubdivisionCode } from "@/lib/subdivision-context";

interface LotDetailContentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lot: any;
  owner: LotOwnerInfo;
  subdivisionId: string;
  balance: number;
  documents: DocumentRecord[];
}

const TABS = [
  { value: "general", label: "General" },
  { value: "documents", label: "Documents" },
  { value: "ledger", label: "Ledger" },
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

function ReadOnlyInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-border last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

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

export function LotDetailContent({ lot: initialLot, owner, subdivisionId, balance, documents }: LotDetailContentProps) {
  const subdivisionCode = useSubdivisionCode();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") ?? "general";
  // ?tab=payments is a legacy URL — shim silently to ledger
  const initialTab = rawTab === "payments" ? "ledger" : rawTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isEditing, setIsEditing] = useState(false);
  const [lot, setLot] = useState(initialLot);

  // Silently rewrite the URL when the payments→ledger shim fires
  useEffect(() => {
    if (rawTab === "payments") {
      window.history.replaceState(null, "", `/subdivisions/${subdivisionCode}/lots/${lot.id}?tab=ledger`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `/subdivisions/${subdivisionCode}/lots/${lot.id}?tab=${value}`);
  }

  function onFieldSaved(field: string, value: string) {
    setLot((prev: typeof lot) => ({ ...prev, [field]: value }));
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

  const isMember = owner.owner_status === "member";
  const isPending = owner.owner_status === "pending_invitation";
  const statusVariant = !isMember ? "neutral" : balance > 0 ? "destructive" : "success";
  const statusLabel = !isMember ? (isPending ? "Pending invitation" : "Unassigned") : balance > 0 ? "Behind" : "Up to date";
  const headerTitle = owner.owner_display_name ?? `Lot ${lot.lot_number}`;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/subdivisions/${subdivisionCode}/manage?tab=lots`}
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
              {headerTitle}
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
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Owner details</h3>
              <ReadOnlyInfoRow
                label="Status"
                value={isMember ? "Active member" : isPending ? "Pending invitation" : "Unassigned"}
              />
              <ReadOnlyInfoRow label="Name" value={owner.owner_display_name ?? "—"} />
              <ReadOnlyInfoRow label="Email" value={owner.owner_contact_email ?? "—"} />
              <ReadOnlyInfoRow label="Phone" value={owner.owner_contact_phone ?? "—"} />
              <p className="mt-3 text-xs text-muted-foreground">
                Owner details come from the accepted invitation + linked profile.
                Change them via the Invite flow on the Manage page, or ask the
                owner to update their profile.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentManager subdivisionId={subdivisionId} lotId={lot.id} initialDocuments={documents} />
      </div>

      <div className={activeTab === "ledger" ? "" : "hidden"}>
        <LedgerTab subdivisionId={subdivisionId} lotId={lot.id} />
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
