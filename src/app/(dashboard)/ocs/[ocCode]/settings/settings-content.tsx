"use client";

import { useState, useRef, useCallback, useEffect, useTransition } from "react";
import { Pencil, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { updateOCField } from "../manage/actions";
import {
  upsertLevyAutosendSchedule,
  updateAutosendOverrides,
  type LevyAutosendSchedule,
} from "@/lib/actions/levy-autosend";
import { buildPlannedSends } from "@/lib/levy-autosend-helpers";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table as ListTable, TableBody as ListTBody, TableCell as ListTd, TableHead as ListTh, TableHeader as ListTHead, TableRow as ListTr,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus as PlusIcon } from "lucide-react";
import { DatePicker } from "@/components/shared/date-picker";

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

interface OCData {
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
  abn?: string | null;
  tfn?: string | null;
  common_seal_text?: string | null;
  inspection_address?: string | null;
  // Wizard-redesign additions.
  annual_interest_rate_percent?: number | null;
  interest_free_period_days?: number | null;
  early_payment_incentive_percent?: number | null;
  arrears_action_threshold_cents?: number | null;
  levy_calculation_basis?: string | null;
  default_delivery_method?: string | null;
  meetings_postal_buffer_days?: number | null;
  levies_postal_buffer_days?: number | null;
  financial_postal_buffer_days?: number | null;
  /** When true, levy notice PDFs include an "arrears as of {bank import
   *  date}" line. Default false , managers opt in. */
  include_arrears_on_notice?: boolean | null;
  /** Per-OC auto multi-lot note. When on, owners with 2+ lots get an
   *  automatic note on each levy notice. */
  multilot_note_enabled?: boolean | null;
  multilot_note_text?: string | null;
  /** Banking , trust account details printed on EFT instructions. */
  bank_bsb?: string | null;
  bank_account_number?: string | null;
  bank_account_name?: string | null;
}

function EditableField({
  label,
  value,
  field,
  ocId,
  isEditing,
  type = "text",
  options,
  onSaved,
}: {
  label: string;
  value: string | null | undefined;
  field: string;
  ocId: string;
  isEditing: boolean;
  type?: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  onSaved?: (newValue: string) => void;
}) {
  const [editValue, setEditValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditValue(value ?? "");
  }, [value, isEditing]);

  const save = useCallback(async () => {
    if (editValue === (value ?? "") || !field) return;
    setSaving(true);
    const result = await updateOCField(ocId, field, editValue || null);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      setEditValue(value ?? "");
    } else {
      onSaved?.(editValue);
      toast.success(`${label || "Field"} updated`);
    }
  }, [editValue, value, field, ocId, label, onSaved]);

  if (!isEditing) {
    const displayValue = options?.find((o) => o.value === value)?.label ?? value;
    return (
      <div className="flex justify-between items-start py-2.5 border-b border-border/50 last:border-b-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm text-foreground text-right max-w-[60%]">{displayValue || ","}</span>
      </div>
    );
  }

  if (type === "select" && options) {
    return (
      <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-b-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); }}
          onBlur={save}
          disabled={saving}
          className="h-7 rounded-md border border-border bg-background px-2 text-sm"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === "textarea") {
    return (
      <div className="py-2">
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={save}
          disabled={saving}
          rows={4}
          className="text-sm"
        />
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") { save(); (e.target as HTMLInputElement).blur(); } }}
        disabled={saving}
        className="h-7 w-48 text-sm text-right"
      />
    </div>
  );
}

// Per-card editor header. Renders the section title + a small
// Edit / Done toggle on the right. Replaces the old global Edit
// button at the top of the settings page.
function CardEditHeader({
  title, editing, onToggle,
}: {
  title: string;
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Button variant="secondary" size="sm" onClick={onToggle}>
        {editing ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Done
          </>
        ) : (
          <>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </>
        )}
      </Button>
    </div>
  );
}

type SettingsTabKey = "general" | "financial" | "communications" | "banking" | "automation";

const TABS: Array<{ key: SettingsTabKey; label: string }> = [
  { key: "general", label: "General" },
  { key: "financial", label: "Financial" },
  { key: "communications", label: "Communications" },
  { key: "banking", label: "Banking" },
  { key: "automation", label: "Automation" },
];

export function SettingsContent({
  oc: initial,
  autosend,
  autosendMailboxOptions,
  autosendBudgets,
}: {
  oc: OCData;
  autosend: LevyAutosendSchedule;
  autosendMailboxOptions: Array<{ value: string; label: string }>;
  autosendBudgets: Array<{ id: string; label: string }>;
}) {
  const [oc, setOC] = useState(initial);
  // Per-card edit toggles , each card flips its own row so the
  // manager only enters edit mode for the section they're tweaking.
  // Keys: 'general' | 'certificate' | 'commonProperty' | 'financial' |
  // 'communicationsDelivery' | 'communicationsNotice' | 'banking'
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const isCardEditing = (key: string) => !!editing[key];
  const toggleCard = (key: string) => setEditing((p) => ({ ...p, [key]: !p[key] }));

  function onFieldSaved(field: string, value: string) {
    setOC((prev) => ({ ...prev, [field]: value }));
  }

  const fyMonth = MONTHS[(oc.financial_year_start_month ?? 7) - 1] ?? "July";
  const monthOptions = MONTHS.map((m, i) => ({ value: String(i + 1), label: m }));
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
  const levyBasisOptions = [
    { value: "lot_liability", label: "Lot liability (standard)" },
    { value: "equal_per_lot", label: "Equal per lot" },
    { value: "custom_apportionment", label: "Custom apportionment" },
  ];
  const deliveryOptions = [
    { value: "postal", label: "Postal only" },
    { value: "mixed", label: "Mixed" },
    { value: "email", label: "Email by default" },
  ];
  const levyBasisLabels: Record<string, string> = Object.fromEntries(levyBasisOptions.map((o) => [o.value, o.label]));
  const deliveryLabels: Record<string, string> = Object.fromEntries(deliveryOptions.map((o) => [o.value, o.label]));

  // URL-synced tab state. ?tab=automation deep-links directly to the
  // auto-send card without the manager having to scroll.
  const [activeTab, setActiveTab] = useState<SettingsTabKey>(() => {
    if (typeof window === "undefined") return "general";
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (TABS.some((t) => t.key === fromUrl)) return fromUrl as SettingsTabKey;
    return "general";
  });

  function switchTab(next: SettingsTabKey) {
    setActiveTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  return (
    <div className="space-y-6">
      {/* Top row: tabs on the left, edit toggle on the right. */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTab(t.key)}
              className={cn(
                "h-9 border-b-2 px-3 text-sm font-medium transition-colors cursor-pointer",
                activeTab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* No global Edit button anymore. Each card carries its own
            Edit/Done toggle in its header so the manager only flips
            the section they're tweaking. */}
      </div>

      {activeTab === "general" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <CardEditHeader title="General details" editing={isCardEditing("general")} onToggle={() => toggleCard("general")} />
              <EditableField label="Name" value={oc.name} field="name" ocId={oc.id} isEditing={isCardEditing("general")} onSaved={(v) => onFieldSaved("name", v)} />
              <EditableField label="Plan number" value={oc.plan_number} field="plan_number" ocId={oc.id} isEditing={isCardEditing("general")} onSaved={(v) => onFieldSaved("plan_number", v)} />
              <EditableField label="Address" value={oc.address} field="address" ocId={oc.id} isEditing={isCardEditing("general")} onSaved={(v) => onFieldSaved("address", v)} />
              {isCardEditing("general") ? (
                <>
                  <EditableField label="ABN" value={oc.abn ?? ""} field="abn" ocId={oc.id} isEditing={true} onSaved={(v) => onFieldSaved("abn", v)} />
                  <EditableField label="TFN" value={oc.tfn ?? ""} field="tfn" ocId={oc.id} isEditing={true} onSaved={(v) => onFieldSaved("tfn", v)} />
                </>
              ) : (
                <>
                  <EditableField label="OC Tier" value={oc.oc_tier ? `Tier ${oc.oc_tier}` : null} field="" ocId={oc.id} isEditing={false} />
                  <EditableField label="Total lots" value={String(oc.total_lots)} field="" ocId={oc.id} isEditing={false} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <CardEditHeader title="Certificate settings" editing={isCardEditing("certificate")} onToggle={() => toggleCard("certificate")} />
              <EditableField label="Common seal text" value={oc.common_seal_text ?? ""} field="common_seal_text" ocId={oc.id} isEditing={isCardEditing("certificate")} type={isCardEditing("certificate") ? "textarea" : "text"} onSaved={(v) => onFieldSaved("common_seal_text", v)} />
              <EditableField label="Inspection address" value={oc.inspection_address ?? ""} field="inspection_address" ocId={oc.id} isEditing={isCardEditing("certificate")} onSaved={(v) => onFieldSaved("inspection_address", v)} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <CardEditHeader title="Common property description" editing={isCardEditing("commonProperty")} onToggle={() => toggleCard("commonProperty")} />
              {isCardEditing("commonProperty") ? (
                <EditableField label="" value={oc.common_property_description} field="common_property_description" ocId={oc.id} isEditing={true} type="textarea" onSaved={(v) => onFieldSaved("common_property_description", v)} />
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {oc.common_property_description || ""}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "financial" && (
        <Card>
          <CardContent className="pt-5">
            <CardEditHeader title="Financial settings" editing={isCardEditing("financial")} onToggle={() => toggleCard("financial")} />
            <EditableField label="Financial year starts" value={isCardEditing("financial") ? String(oc.financial_year_start_month) : fyMonth} field="financial_year_start_month" ocId={oc.id} isEditing={isCardEditing("financial")} type={isCardEditing("financial") ? "select" : "text"} options={monthOptions} onSaved={(v) => onFieldSaved("financial_year_start_month", v)} />
            <EditableField label="Billing cycle" value={isCardEditing("financial") ? oc.billing_cycle : (BILLING_LABELS[oc.billing_cycle] ?? oc.billing_cycle)} field="billing_cycle" ocId={oc.id} isEditing={isCardEditing("financial")} type={isCardEditing("financial") ? "select" : "text"} options={billingOptions} onSaved={(v) => onFieldSaved("billing_cycle", v)} />
            <EditableField label="Rules type" value={isCardEditing("financial") ? oc.rules_type : (oc.rules_type === "model" ? "Model rules" : "Custom rules")} field="rules_type" ocId={oc.id} isEditing={isCardEditing("financial")} type={isCardEditing("financial") ? "select" : "text"} options={rulesOptions} onSaved={(v) => onFieldSaved("rules_type", v)} />
            <EditableField label="Levy calculation basis" value={isCardEditing("financial") ? (oc.levy_calculation_basis ?? "lot_liability") : (levyBasisLabels[oc.levy_calculation_basis ?? "lot_liability"] ?? "Lot liability")} field="levy_calculation_basis" ocId={oc.id} isEditing={isCardEditing("financial")} type={isCardEditing("financial") ? "select" : "text"} options={levyBasisOptions} onSaved={(v) => onFieldSaved("levy_calculation_basis", v)} />
            <EditableField label="Early payment incentive (%)" value={String(oc.early_payment_incentive_percent ?? 0)} field="early_payment_incentive_percent" ocId={oc.id} isEditing={isCardEditing("financial")} onSaved={(v) => onFieldSaved("early_payment_incentive_percent", v)} />
            <EditableField label="Annual interest rate (%)" value={String(oc.annual_interest_rate_percent ?? 0)} field="annual_interest_rate_percent" ocId={oc.id} isEditing={isCardEditing("financial")} onSaved={(v) => onFieldSaved("annual_interest_rate_percent", v)} />
            <EditableField label="Interest-free period (days)" value={String(oc.interest_free_period_days ?? 28)} field="interest_free_period_days" ocId={oc.id} isEditing={isCardEditing("financial")} onSaved={(v) => onFieldSaved("interest_free_period_days", v)} />
            <EditableField label="Arrears action threshold (cents)" value={String(oc.arrears_action_threshold_cents ?? 5000)} field="arrears_action_threshold_cents" ocId={oc.id} isEditing={isCardEditing("financial")} onSaved={(v) => onFieldSaved("arrears_action_threshold_cents", v)} />
            <EditableField
              label="Include arrears on levy notices"
              value={isCardEditing("financial") ? (oc.include_arrears_on_notice ? "yes" : "no") : (oc.include_arrears_on_notice ? "Yes" : "No")}
              field="include_arrears_on_notice"
              ocId={oc.id}
              isEditing={isCardEditing("financial")}
              type={isCardEditing("financial") ? "select" : "text"}
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
              onSaved={(v) => onFieldSaved("include_arrears_on_notice", v)}
            />
          </CardContent>
        </Card>
      )}

      {activeTab === "communications" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <CardEditHeader title="Delivery" editing={isCardEditing("commsDelivery")} onToggle={() => toggleCard("commsDelivery")} />
              <EditableField label="Default delivery method" value={isCardEditing("commsDelivery") ? (oc.default_delivery_method ?? "postal") : (deliveryLabels[oc.default_delivery_method ?? "postal"] ?? "Postal only")} field="default_delivery_method" ocId={oc.id} isEditing={isCardEditing("commsDelivery")} type={isCardEditing("commsDelivery") ? "select" : "text"} options={deliveryOptions} onSaved={(v) => onFieldSaved("default_delivery_method", v)} />
              <EditableField label="Meetings postal buffer (days)" value={String(oc.meetings_postal_buffer_days ?? 14)} field="meetings_postal_buffer_days" ocId={oc.id} isEditing={isCardEditing("commsDelivery")} onSaved={(v) => onFieldSaved("meetings_postal_buffer_days", v)} />
              <EditableField label="Levies postal buffer (days)" value={String(oc.levies_postal_buffer_days ?? 14)} field="levies_postal_buffer_days" ocId={oc.id} isEditing={isCardEditing("commsDelivery")} onSaved={(v) => onFieldSaved("levies_postal_buffer_days", v)} />
              <EditableField label="Financial documents postal buffer (days)" value={String(oc.financial_postal_buffer_days ?? 14)} field="financial_postal_buffer_days" ocId={oc.id} isEditing={isCardEditing("commsDelivery")} onSaved={(v) => onFieldSaved("financial_postal_buffer_days", v)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <CardEditHeader title="Levy notice content" editing={isCardEditing("commsNotice")} onToggle={() => toggleCard("commsNotice")} />
              <EditableField
                label="Add note for multi-lot owners"
                value={isCardEditing("commsNotice") ? (oc.multilot_note_enabled ? "yes" : "no") : (oc.multilot_note_enabled ? "Yes" : "No")}
                field="multilot_note_enabled"
                ocId={oc.id}
                isEditing={isCardEditing("commsNotice")}
                type={isCardEditing("commsNotice") ? "select" : "text"}
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                onSaved={(v) => onFieldSaved("multilot_note_enabled", v)}
              />
              {oc.multilot_note_enabled && (
                <EditableField
                  label="Multi-lot note text"
                  value={oc.multilot_note_text ?? ""}
                  field="multilot_note_text"
                  ocId={oc.id}
                  isEditing={isCardEditing("commsNotice")}
                  type={isCardEditing("commsNotice") ? "textarea" : "text"}
                  onSaved={(v) => onFieldSaved("multilot_note_text", v)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "banking" && (
        <Card>
          <CardContent className="pt-5">
            <CardEditHeader title="Trust account details" editing={isCardEditing("banking")} onToggle={() => toggleCard("banking")} />
            <EditableField label="Account name" value={oc.bank_account_name ?? ""} field="bank_account_name" ocId={oc.id} isEditing={isCardEditing("banking")} onSaved={(v) => onFieldSaved("bank_account_name", v)} />
            <EditableField label="BSB" value={oc.bank_bsb ?? ""} field="bank_bsb" ocId={oc.id} isEditing={isCardEditing("banking")} onSaved={(v) => onFieldSaved("bank_bsb", v)} />
            <EditableField label="Account number" value={oc.bank_account_number ?? ""} field="bank_account_number" ocId={oc.id} isEditing={isCardEditing("banking")} onSaved={(v) => onFieldSaved("bank_account_number", v)} />
          </CardContent>
        </Card>
      )}

      {activeTab === "automation" && (
        <AutomationsTab
          ocId={oc.id}
          billingCycle={oc.billing_cycle}
          autosend={autosend}
          mailboxOptions={autosendMailboxOptions}
          budgets={autosendBudgets}
        />
      )}
    </div>
  );
}

// ─── Auto-send levies card ──────────────────────────────────
// Lives on the Automation tab. Reads/writes
// levy_autosend_schedules. Manager toggles enabled, picks a budget,
// chooses a day of month, picks a mailbox. The daily cron fires the
// generation + send on next_send_date and advances the date by the
// OC's billing cycle (monthly / quarterly / half-yearly / annually).
// ─── Automation tab , table of automations + add-side-drawer ───────
// Today there's exactly one kind of automation (auto-send levies).
// Adding more later just means inserting another row + a different
// drawer variant. Empty state renders the table with no rows + an
// "Add automation" button.
function AutomationsTab({
  ocId,
  billingCycle,
  autosend,
  mailboxOptions,
  budgets,
}: {
  ocId: string;
  billingCycle: string;
  autosend: LevyAutosendSchedule;
  mailboxOptions: Array<{ value: string; label: string }>;
  budgets: Array<{ id: string; label: string }>;
}) {
  // Drawer state. "edit" carries the row being edited (or "new" for
  // the Add Automation flow). null = closed.
  const [drawerMode, setDrawerMode] = useState<null | "edit-autosend" | "new">(null);

  // Today the rows array is just the auto-send row (if it exists).
  // When more automation types ship, push them here.
  const rows: Array<{
    key: string;
    type: string;
    nextRun: string | null;
    lastRun: string | null;
    status: "on" | "off" | "error";
    raw?: LevyAutosendSchedule;
  }> = [];
  if (autosend.id || autosend.enabled) {
    rows.push({
      key: autosend.id ?? "autosend",
      type: "Auto-send levies",
      nextRun: autosend.next_send_date,
      lastRun: autosend.last_sent_on,
      status: autosend.last_error ? "error" : autosend.enabled ? "on" : "off",
      raw: autosend,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDrawerMode("new")}>
          <PlusIcon className="mr-1.5 h-3.5 w-3.5" />
          Add automation
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <ListTable variant="striped">
          <ListTHead>
            <ListTr>
              <ListTh>Type</ListTh>
              <ListTh>Next run</ListTh>
              <ListTh>Last run</ListTh>
              <ListTh>Status</ListTh>
            </ListTr>
          </ListTHead>
          <ListTBody>
            {rows.length === 0 ? (
              <ListTr>
                <ListTd colSpan={4} className="text-center py-10 text-sm text-muted-foreground">
                  No automations yet. Click &quot;Add automation&quot; to get started.
                </ListTd>
              </ListTr>
            ) : (
              rows.map((r) => (
                <ListTr key={r.key} className="cursor-pointer" onClick={() => setDrawerMode("edit-autosend")}>
                  <ListTd className="text-foreground">{r.type}</ListTd>
                  <ListTd className="text-foreground text-sm">{r.nextRun ?? ""}</ListTd>
                  <ListTd className="text-foreground text-sm">{r.lastRun ?? ""}</ListTd>
                  <ListTd>
                    <Badge
                      variant={
                        r.status === "on" ? "success"
                        : r.status === "error" ? "destructive"
                        : "neutral"
                      }
                    >
                      {r.status === "on" ? "On" : r.status === "error" ? "Error" : "Off"}
                    </Badge>
                  </ListTd>
                </ListTr>
              ))
            )}
          </ListTBody>
        </ListTable>
      </div>

      {/* Side drawer , holds the auto-send config (today the only
          automation). For Add-Automation we surface the same form
          since auto-send is the only option, plus a placeholder
          message saying more types are coming. */}
      <Sheet open={drawerMode !== null} onOpenChange={(o) => { if (!o) setDrawerMode(null); }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {drawerMode === "new" ? "Add automation" : "Auto-send levies"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Configure how this automation runs.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {drawerMode === "new" && (
              <p className="text-xs text-muted-foreground mb-3">
                Auto-send levies is the only automation today. More types coming soon.
              </p>
            )}
            <AutoSendCard
              ocId={ocId}
              billingCycle={billingCycle}
              initial={autosend}
              mailboxOptions={mailboxOptions}
              budgets={budgets}
              embedded
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AutoSendCard({
  ocId,
  billingCycle,
  initial,
  mailboxOptions,
  budgets,
  embedded = false,
}: {
  ocId: string;
  billingCycle: string;
  initial: LevyAutosendSchedule;
  mailboxOptions: Array<{ value: string; label: string }>;
  budgets: Array<{ id: string; label: string }>;
  /** When true, render the form's contents directly , no surrounding
   *  Card or duplicate header , so it sits cleanly inside the
   *  Automations side drawer. */
  embedded?: boolean;
}) {
  // Day-of-month input holds a STRING so the manager can clear the
  // field while typing without us forcing 1 back in. The "Last day of
  // month" toggle short-circuits the number; when on we save 31 which
  // the cron clamps to the actual last day per month.
  const [draft, setDraft] = useState({
    enabled: initial.enabled,
    budget_id: initial.budget_id ?? "",
    send_day_of_month: String(initial.send_day_of_month === 31 ? "" : initial.send_day_of_month),
    last_day_of_month: initial.send_day_of_month === 31,
    from_address: initial.from_address ?? mailboxOptions[0]?.value ?? "",
  });
  const [dayInvalid, setDayInvalid] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(initial.last_sent_on);
  const [nextDate, setNextDate] = useState<string | null>(initial.next_send_date);

  // Schedule popup state. Opens after Save when auto-send is on.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>(initial.date_overrides ?? {});
  const [savingOverrides, setSavingOverrides] = useState(false);

  const cycleLabel: Record<string, string> = {
    monthly: "monthly",
    quarterly: "every 3 months",
    half_yearly: "every 6 months",
    annually: "yearly",
  };

  function save() {
    // Resolve the effective day-of-month:
    // - "Last day of month" toggled on → 31 (cron clamps to actual last day).
    // - Otherwise parse the input. Must be 1-28 to avoid month-skip
    //   surprises (e.g. day 30 in Feb).
    let resolvedDay: number | null = null;
    if (draft.last_day_of_month) {
      resolvedDay = 31;
    } else {
      const parsed = parseInt(draft.send_day_of_month, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 28) {
        resolvedDay = parsed;
      }
    }
    if (draft.enabled && resolvedDay === null) {
      setDayInvalid(true);
      toast.error("Pick a day between 1 and 28, or turn on 'Last day of month'.");
      return;
    }
    setDayInvalid(false);

    startTransition(async () => {
      const res = await upsertLevyAutosendSchedule(ocId, {
        enabled: draft.enabled,
        budget_id: draft.budget_id || null,
        send_day_of_month: resolvedDay ?? 1,
        from_address: draft.from_address || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(draft.enabled ? "Auto-send is on" : "Auto-send is off");
      setSavedAt(res.schedule?.last_sent_on ?? null);
      setNextDate(res.schedule?.next_send_date ?? null);
      // Pop the schedule preview right after save so the manager
      // immediately sees the next 12 send dates and can tweak any
      // specific month before walking away.
      if (draft.enabled) setScheduleOpen(true);
    });
  }

  // Today's date used as the planner anchor. Computed at render so the
  // preview matches "now" without needing a server round-trip.
  const todayIso = new Date().toISOString().slice(0, 10);
  // Schedule preview reads the resolved day (1..28 or 31 for "last day").
  // Falls back to 1 while the manager is mid-edit so the popup always
  // has something to render without crashing.
  const previewDay = draft.last_day_of_month
    ? 31
    : (parseInt(draft.send_day_of_month, 10) || 1);
  const planned = buildPlannedSends(
    { send_day_of_month: previewDay, date_overrides: overrides },
    billingCycle,
    todayIso,
    // Match the billing cycle: monthly = 12 dates, quarterly = 4,
    // half-yearly = 2, annually = 1. Showing 12 "monthly" dates for
    // an annual schedule is just noise.
    ({ monthly: 12, quarterly: 4, half_yearly: 2, annually: 1 } as Record<string, number>)[billingCycle] ?? 12,
  );

  async function saveOverrides() {
    setSavingOverrides(true);
    const res = await updateAutosendOverrides(ocId, overrides);
    setSavingOverrides(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Schedule updated");
    setScheduleOpen(false);
  }

  // Body of the card. Wrapped in <Card>/<CardContent> for standalone
  // use; rendered as a plain div when embedded in a drawer.
  const body = (
    <div className={embedded ? "space-y-4" : ""}>
        <div className="flex items-center justify-between">
          <div>
            {!embedded && (<h3 className="text-sm font-semibold text-foreground">Auto-send levies</h3>)}
            <p className="text-xs text-muted-foreground mt-0.5">
              {draft.enabled ? "Enabled , the cron will send on the configured cadence." : "Off"}
            </p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(checked) => setDraft((p) => ({ ...p, enabled: checked }))}
            aria-label="Toggle auto-send"
          />
        </div>

        {/* Budget picker takes the full width when expanded so long
            "Capital Works Fund , 2025-2026" labels aren't truncated.
            Sits on its own row instead of sharing with the mailbox. */}
        <div className="space-y-1.5">
          <Label>Budget</Label>
          <Combobox
            items={budgets}
            value={draft.budget_id}
            onValueChange={(v) => setDraft((p) => ({ ...p, budget_id: v ?? "" }))}
            disabled={!draft.enabled}
          >
            <ComboboxInput placeholder="Pick a budget" />
            <ComboboxContent>
              <ComboboxEmpty>No approved budgets.</ComboboxEmpty>
              <ComboboxList>
                {(b: { id: string; label: string }) => (
                  <ComboboxItem key={b.id} value={b.id}>
                    {b.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">

          <div className="space-y-1.5">
            <Label>Send mailbox</Label>
            <Select
              value={draft.from_address}
              onValueChange={(v) => setDraft((p) => ({ ...p, from_address: v ?? "" }))}
              disabled={!draft.enabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a mailbox" />
              </SelectTrigger>
              <SelectContent>
                {mailboxOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Day of month</Label>
            <div className="flex gap-2">
              <NumberInput
                value={draft.send_day_of_month}
                onChange={(v) => {
                  setDraft((p) => ({ ...p, send_day_of_month: v, last_day_of_month: false }));
                  setDayInvalid(false);
                }}
                allowDecimal={false}
                disabled={!draft.enabled || draft.last_day_of_month}
                invalid={dayInvalid}
                placeholder="1-28"
              />
            </div>
            <label className={`flex items-center gap-2 text-xs ${draft.enabled ? "text-muted-foreground cursor-pointer" : "text-muted-foreground/50"}`}>
              <input
                type="checkbox"
                checked={draft.last_day_of_month}
                disabled={!draft.enabled}
                onChange={(e) => {
                  setDraft((p) => ({ ...p, last_day_of_month: e.target.checked, send_day_of_month: e.target.checked ? "" : p.send_day_of_month }));
                  setDayInvalid(false);
                }}
                className="cursor-pointer"
              />
              Last day of month
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <div className="h-10 rounded-md border border-border bg-cool-muted px-3 flex items-center text-sm text-cool-muted-foreground">
              {cycleLabel[billingCycle] ?? billingCycle}
            </div>
          </div>
        </div>

        {(nextDate || savedAt) && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {nextDate && <div>Next run: <span className="font-medium text-foreground">{nextDate}</span></div>}
            {savedAt && <div>Last sent: <span className="font-medium text-foreground">{savedAt}</span></div>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {initial.enabled && (
            <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
              View schedule
            </Button>
          )}
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save auto-send
          </Button>
        </div>

      {/* Schedule popup. Shows the next 12 planned send dates. Each
          row can be overridden to a different day in THE SAME month
          (per the brief: no cross-month moves). Save persists the
          overrides into levy_autosend_schedules.date_overrides. */}
      <Dialog open={scheduleOpen} onOpenChange={(o) => { if (!savingOverrides) setScheduleOpen(o); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Auto-send schedule</DialogTitle>
            <DialogDescription>
              Next 12 planned runs. Tweak any month&apos;s date , the override has to stay inside the same calendar month.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {planned.map((p) => {
              const [yy, mm] = p.monthKey.split("-");
              const monthLabel = new Date(Date.UTC(Number(yy), Number(mm) - 1, 1))
                .toLocaleDateString("en-AU", { month: "long", year: "numeric" });
              // Lock the calendar to this specific month.
              const firstOfMonth = `${p.monthKey}-01`;
              const lastDay = new Date(Date.UTC(Number(yy), Number(mm), 0)).getUTCDate();
              const lastOfMonth = `${p.monthKey}-${lastDay.toString().padStart(2, "0")}`;
              return (
                <div key={p.monthKey} className="grid grid-cols-[1fr_180px_auto] items-center gap-3">
                  <span className="text-sm font-medium text-foreground">{monthLabel}</span>
                  <DatePicker
                    value={p.effectiveDate}
                    onChange={(v) => {
                      setOverrides((o) => {
                        const next = { ...o };
                        if (v === p.defaultDate) delete next[p.monthKey];
                        else next[p.monthKey] = v;
                        return next;
                      });
                    }}
                    minDate={firstOfMonth}
                    maxDate={lastOfMonth}
                  />
                  {p.isOverridden ? (
                    <button
                      type="button"
                      onClick={() => setOverrides((o) => {
                        const next = { ...o };
                        delete next[p.monthKey];
                        return next;
                      })}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Reset
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Default</span>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)} disabled={savingOverrides}>
              Close
            </Button>
            <Button onClick={saveOverrides} disabled={savingOverrides}>
              {savingOverrides && <Loader2 className="size-4 animate-spin" />}
              Save schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return embedded ? body : (
    <Card>
      <CardContent className="pt-5">{body}</CardContent>
    </Card>
  );
}
