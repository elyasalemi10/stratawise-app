"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value: string; // ISO date string YYYY-MM-DD
  onChange: (value: string) => void;
  error?: boolean;
  id?: string;
  placeholder?: string;
}

export function DatePicker({
  value,
  onChange,
  error,
  id,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const date = value ? new Date(value + "T00:00:00") : undefined;

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
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-start rounded-md border bg-background px-3 text-sm font-normal",
          error ? "border-destructive" : "border-border",
          !value && "text-muted-foreground",
          "hover:border-primary/50"
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
        {date ? format(date, "PPP") : placeholder}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-lg border border-border bg-popover shadow-md">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => {
              if (d) {
                const iso = format(d, "yyyy-MM-dd");
                onChange(iso);
              }
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
