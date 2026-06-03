"use client";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Hour / minute / am-pm dropdown trio (distinct from the single-select
// TimePicker). Value is 24h "HH:mm" (e.g. "18:30"); converts to/from 12h for
// display. Minutes step by 5.

interface TimeDropdownsProps {
  value: string; // "HH:mm" 24h
  onChange: (next: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,...,55

function parse(value: string): { hour12: number; minute: number; ampm: "am" | "pm" } {
  const [hStr, mStr] = (value || "18:00").split(":");
  const h24 = Math.min(23, Math.max(0, parseInt(hStr, 10) || 0));
  const minute = Math.min(59, Math.max(0, parseInt(mStr, 10) || 0));
  const ampm: "am" | "pm" = h24 < 12 ? "am" : "pm";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, ampm };
}

function to24(hour12: number, minute: number, ampm: "am" | "pm"): string {
  let h = hour12 % 12;
  if (ampm === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TimeDropdowns({ value, onChange }: TimeDropdownsProps) {
  const { hour12, minute, ampm } = parse(value);
  const minuteSnapped = MINUTES.includes(minute) ? minute : (Math.round(minute / 5) * 5) % 60;

  return (
    <div className="flex items-center gap-2">
      <Select value={String(hour12)} onValueChange={(v) => onChange(to24(parseInt(v ?? "0", 10), minuteSnapped, ampm))}>
        <SelectTrigger className="w-20"><SelectValue>{hour12}</SelectValue></SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={String(minuteSnapped)} onValueChange={(v) => onChange(to24(hour12, parseInt(v ?? "0", 10), ampm))}>
        <SelectTrigger className="w-20"><SelectValue>{String(minuteSnapped).padStart(2, "0")}</SelectValue></SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={ampm} onValueChange={(v) => onChange(to24(hour12, minuteSnapped, (v as "am" | "pm") ?? "pm"))}>
        <SelectTrigger className="w-20"><SelectValue>{ampm.toUpperCase()}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="am">AM</SelectItem>
          <SelectItem value="pm">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
