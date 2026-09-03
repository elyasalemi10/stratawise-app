"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFieldSave } from "@/lib/use-field-save";
import { updateOCField } from "../manage/actions";

// One OC setting, edited in place, exactly like a field on the account
// settings pages , same hook, same shape, same toast.
//
// These used to be read-only rows behind a per-card Edit drawer. That hid
// every current value behind a click before you could change one, and made
// changing a single number a five-step errand: click Edit, find the field,
// type, click Save, wait for the drawer to close.
//
// Text saves when you leave it and only if it changed. Selects and switches
// save the moment you pick, because there is nothing to leave.

export type OCFieldType = "text" | "textarea" | "number" | "select" | "boolean";

export interface OCFieldProps {
  ocId: string;
  fieldKey: string;
  label: string;
  type: OCFieldType;
  value: string | number | boolean | null | undefined;
  options?: { value: string; label: string }[];
  onSaved: (key: string, value: string | boolean) => void;
  /** Span both columns of the parent grid. */
  wide?: boolean;
  /** Decimals allowed on a number field. */
  allowDecimal?: boolean;
  suffix?: string;
}

export function OCField({
  ocId, fieldKey, label, type, value, options, onSaved, wide, allowDecimal = true, suffix,
}: OCFieldProps) {
  const id = `oc-${fieldKey}`;
  const initial = value == null ? "" : String(value);

  const f = useFieldSave(
    initial,
    async (next) => {
      const res = await updateOCField(ocId, fieldKey, next === "" ? null : next);
      if (!res?.error) onSaved(fieldKey, next);
      return res ?? {};
    },
    { successMessage: `${label} saved` },
  );

  // Selects and switches write directly , there is no blur to wait for.
  async function saveNow(next: string | boolean) {
    const res = await updateOCField(ocId, fieldKey, next === "" ? null : next);
    if (res?.error) {
      const { toast } = await import("sonner");
      toast.error(res.error);
      return;
    }
    onSaved(fieldKey, next);
    const { toast } = await import("sonner");
    toast.success(`${label} saved`);
  }

  if (type === "boolean") {
    return (
      <div className={wide ? "sm:col-span-2" : undefined}>
        <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-3 py-2">
          <Label className="font-normal">{label}</Label>
          <Switch
            checked={!!value}
            onCheckedChange={(v) => saveNow(v === true)}
            aria-label={label}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>

        {type === "text" && (
          <Input
            id={id}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            onBlur={f.onBlur}
            aria-invalid={f.invalid || undefined}
            placeholder={label}
          />
        )}

        {type === "textarea" && (
          <Textarea
            id={id}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
            onBlur={f.onBlur}
            aria-invalid={f.invalid || undefined}
            rows={4}
            placeholder={label}
          />
        )}

        {type === "number" && (
          <NumberInput
            value={f.value}
            onChange={f.onChange}
            onBlur={f.onBlur}
            invalid={f.invalid}
            allowDecimal={allowDecimal}
            suffix={suffix}
            placeholder={label}
          />
        )}

        {type === "select" && (
          <Select
            value={initial}
            onValueChange={(v) => { if (v && v !== initial) saveNow(v); }}
          >
            <SelectTrigger id={id}>
              <SelectValue>
                {options?.find((o) => o.value === initial)?.label ?? ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(options ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

/** A value the manager cannot change here (derived or set elsewhere). */
export function OCReadonly({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex h-9 items-center rounded-md border border-border bg-cool-muted px-3 text-sm text-cool-muted-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}
