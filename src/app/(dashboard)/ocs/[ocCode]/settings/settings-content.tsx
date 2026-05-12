"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateOCField } from "../manage/actions";

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
        <span className="text-sm text-foreground text-right max-w-[60%]">{displayValue || "—"}</span>
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

export function SettingsContent({ oc: initial }: { oc: OCData }) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">OC settings</h1>
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
            <h3 className="text-sm font-semibold text-foreground mb-3">Financial settings</h3>
            <EditableField label="Financial year starts" value={isEditing ? String(oc.financial_year_start_month) : fyMonth} field="financial_year_start_month" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={monthOptions} onSaved={(v) => onFieldSaved("financial_year_start_month", v)} />
            <EditableField label="Billing cycle" value={isEditing ? oc.billing_cycle : (BILLING_LABELS[oc.billing_cycle] ?? oc.billing_cycle)} field="billing_cycle" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={billingOptions} onSaved={(v) => onFieldSaved("billing_cycle", v)} />
            <EditableField label="Rules type" value={isEditing ? oc.rules_type : (oc.rules_type === "model" ? "Model rules" : "Custom rules")} field="rules_type" ocId={oc.id} isEditing={isEditing} type={isEditing ? "select" : "text"} options={rulesOptions} onSaved={(v) => onFieldSaved("rules_type", v)} />
          </CardContent>
        </Card>

        {/* Certificate settings */}
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
    </div>
  );
}
