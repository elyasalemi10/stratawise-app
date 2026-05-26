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
  const [isEditing, setIsEditing] = useState(false);

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

      {activeTab === "general" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">General details</h3>
              <EditableField label="Name" value={oc.name} field="name" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("name", v)} />
              <EditableField label="Plan number" value={oc.plan_number} field="plan_number" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("plan_number", v)} />
              <EditableField label="Address" value={oc.address} field="address" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("address", v)} />
              {isEditing && (
                <>
                  <EditableField label="ABN" value={oc.abn ?? ""} field="abn" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("abn", v)} />
                  <EditableField label="TFN" value={oc.tfn ?? ""} field="tfn" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("tfn", v)} />
                </>
              )}
              {!isEditing && (
                <>
                  <EditableField label="OC Tier" value={oc.oc_tier ? `Tier ${oc.oc_tier}` : null} field="" ocId={oc.id} isEditing={false} />
                  <EditableField label="Total lots" value={String(oc.total_lots)} field="" ocId={oc.id} isEditing={false} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Certificate settings</h3>
              <EditableField label="Common seal text" value={oc.common_seal_text ?? ""} field="common_seal_text" ocId={oc.id} isEditing={isEditing} type={isEditing ? "textarea" : "text"} onSaved={(v) => onFieldSaved("common_seal_text", v)} />
              <EditableField label="Inspection address" value={oc.inspection_address ?? ""} field="inspection_address" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("inspection_address", v)} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Common property description</h3>
              {isEditing ? (
                <EditableField label="" value={oc.common_property_description} field="common_property_description" ocId={oc.id} isEditing={true} type="textarea" onSaved={(v) => onFieldSaved("common_property_description", v)} />
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {oc.common_property_description || "No description set."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "financial" && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Financial settings</h3>
            <EditableField label="Financial year starts" value={isEditing ? String(oc.financial_year_start_month) : fyMonth} field="financial_year_start_month" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={monthOptions} onSaved={(v) => onFieldSaved("financial_year_start_month", v)} />
            <EditableField label="Billing cycle" value={isEditing ? oc.billing_cycle : (BILLING_LABELS[oc.billing_cycle] ?? oc.billing_cycle)} field="billing_cycle" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={billingOptions} onSaved={(v) => onFieldSaved("billing_cycle", v)} />
            <EditableField label="Rules type" value={isEditing ? oc.rules_type : (oc.rules_type === "model" ? "Model rules" : "Custom rules")} field="rules_type" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={rulesOptions} onSaved={(v) => onFieldSaved("rules_type", v)} />
            <EditableField label="Levy calculation basis" value={isEditing ? (oc.levy_calculation_basis ?? "lot_liability") : (levyBasisLabels[oc.levy_calculation_basis ?? "lot_liability"] ?? "Lot liability")} field="levy_calculation_basis" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={levyBasisOptions} onSaved={(v) => onFieldSaved("levy_calculation_basis", v)} />
            <EditableField label="Early payment incentive (%)" value={String(oc.early_payment_incentive_percent ?? 0)} field="early_payment_incentive_percent" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("early_payment_incentive_percent", v)} />
            <EditableField label="Annual interest rate (%)" value={String(oc.annual_interest_rate_percent ?? 0)} field="annual_interest_rate_percent" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("annual_interest_rate_percent", v)} />
            <EditableField label="Interest-free period (days)" value={String(oc.interest_free_period_days ?? 28)} field="interest_free_period_days" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("interest_free_period_days", v)} />
            <EditableField label="Arrears action threshold (cents)" value={String(oc.arrears_action_threshold_cents ?? 5000)} field="arrears_action_threshold_cents" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("arrears_action_threshold_cents", v)} />
            <EditableField
              label="Include arrears on levy notices"
              value={isEditing ? (oc.include_arrears_on_notice ? "yes" : "no") : (oc.include_arrears_on_notice ? "Yes" : "No")}
              field="include_arrears_on_notice"
              ocId={oc.id}
              isEditing={isEditing}
              type={isEditing ? "select" : "text"}
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
              <h3 className="text-sm font-semibold text-foreground mb-3">Delivery</h3>
              <EditableField label="Default delivery method" value={isEditing ? (oc.default_delivery_method ?? "postal") : (deliveryLabels[oc.default_delivery_method ?? "postal"] ?? "Postal only")} field="default_delivery_method" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={deliveryOptions} onSaved={(v) => onFieldSaved("default_delivery_method", v)} />
              <EditableField label="Meetings postal buffer (days)" value={String(oc.meetings_postal_buffer_days ?? 14)} field="meetings_postal_buffer_days" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("meetings_postal_buffer_days", v)} />
              <EditableField label="Levies postal buffer (days)" value={String(oc.levies_postal_buffer_days ?? 14)} field="levies_postal_buffer_days" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("levies_postal_buffer_days", v)} />
              <EditableField label="Financial documents postal buffer (days)" value={String(oc.financial_postal_buffer_days ?? 14)} field="financial_postal_buffer_days" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("financial_postal_buffer_days", v)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">Levy notice content</h3>
              {/* "Include arrears on levy notices" lives in the
                  Financial tab now (it's a money-content decision, not
                  a delivery one). */}
              <EditableField
                label="Add note for multi-lot owners"
                value={isEditing ? (oc.multilot_note_enabled ? "yes" : "no") : (oc.multilot_note_enabled ? "Yes" : "No")}
                field="multilot_note_enabled"
                ocId={oc.id}
                isEditing={isEditing}
                type={isEditing ? "select" : "text"}
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                onSaved={(v) => onFieldSaved("multilot_note_enabled", v)}
              />
              {oc.multilot_note_enabled && (
                <EditableField
                  label="Multi-lot note text"
                  value={oc.multilot_note_text ?? ""}
                  field="multilot_note_text"
                  ocId={oc.id}
                  isEditing={isEditing}
                  type={isEditing ? "textarea" : "text"}
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
            <h3 className="text-sm font-semibold text-foreground mb-3">Trust account details</h3>
            <EditableField label="Account name" value={oc.bank_account_name ?? ""} field="bank_account_name" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("bank_account_name", v)} />
            <EditableField label="BSB" value={oc.bank_bsb ?? ""} field="bank_bsb" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("bank_bsb", v)} />
            <EditableField label="Account number" value={oc.bank_account_number ?? ""} field="bank_account_number" ocId={oc.id} isEditing={isEditing} onSaved={(v) => onFieldSaved("bank_account_number", v)} />
          </CardContent>
        </Card>
      )}

      {activeTab === "automation" && (
        <AutoSendCard
          ocId={oc.id}
          billingCycle={oc.billing_cycle}
          initial={autosend}
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
function AutoSendCard({
  ocId,
  billingCycle,
  initial,
  mailboxOptions,
  budgets,
}: {
  ocId: string;
  billingCycle: string;
  initial: LevyAutosendSchedule;
  mailboxOptions: Array<{ value: string; label: string }>;
  budgets: Array<{ id: string; label: string }>;
}) {
  const [draft, setDraft] = useState({
    enabled: initial.enabled,
    budget_id: initial.budget_id ?? "",
    send_day_of_month: initial.send_day_of_month,
    from_address: initial.from_address ?? mailboxOptions[0]?.value ?? "",
  });
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
    startTransition(async () => {
      const res = await upsertLevyAutosendSchedule(ocId, {
        enabled: draft.enabled,
        budget_id: draft.budget_id || null,
        send_day_of_month: draft.send_day_of_month,
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
  const planned = buildPlannedSends(
    { send_day_of_month: draft.send_day_of_month, date_overrides: overrides },
    billingCycle,
    todayIso,
    12,
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

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Auto-send levies</h3>
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
            <NumberInput
              value={String(draft.send_day_of_month)}
              onChange={(v) => setDraft((p) => ({ ...p, send_day_of_month: Math.max(1, Math.min(31, parseInt(v) || 1)) }))}
              allowDecimal={false}
              disabled={!draft.enabled}
            />
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
      </CardContent>

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
    </Card>
  );
}
