"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// 30-minute granularity covers the formats CoCs and meeting notices actually
// use ("4:00pm to 4:00pm", "9:30am AGM start"). Storing the canonical 24h
// "HH:MM" string keeps Postgres TIME columns happy while the UI label stays
// human ("4:00 PM"). Granularity is intentionally coarse , managers should
// not be typing 4:17 PM.
const SLOTS = (() => {
  const out: Array<{ value: string; label: string }> = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const value = `${hh}:${mm}`;
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? "AM" : "PM";
      const label = `${h12}:${mm} ${ampm}`;
      out.push({ value, label });
    }
  }
  return out;
})();

function labelFor(value: string | null | undefined): string {
  if (!value) return "";
  const found = SLOTS.find((s) => s.value === value);
  if (found) return found.label;
  // Off-grid value (e.g. parsed from a cert) , render in 12-hour without
  // forcing it onto a half-hour slot.
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function TimePicker({
  value,
  onChange,
  id,
  placeholder = "Time",
  error,
  className,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  id?: string;
  placeholder?: string;
  error?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(!v || v === "__none__" ? "" : v)}
    >
      <SelectTrigger id={id} aria-invalid={error || undefined} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder}>
          {value ? labelFor(value) : placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[280px]">
        <SelectItem value="__none__">No time</SelectItem>
        {SLOTS.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
