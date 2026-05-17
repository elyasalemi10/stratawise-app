"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Position calculated relative to the viewport so the popup escapes any
  // overflow-hidden / overflow-y-auto ancestor (e.g. the right-side
  // settlement drawer). Updated on open + on window scroll/resize so the
  // popup tracks the trigger if the page moves underneath.
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const date = value ? new Date(value + "T00:00:00") : undefined;

  // SSR-safe "are we in the browser" check via useSyncExternalStore — no
  // setState in an effect, avoids the react-hooks/set-state-in-effect rule.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-start rounded-md border bg-card px-3 text-sm font-normal",
          error ? "border-destructive" : "border-border",
          !value && "text-muted-foreground",
          "hover:border-primary/50",
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
        {date ? format(date, "PPP") : placeholder}
      </button>

      {open && mounted && position &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              minWidth: position.width,
              zIndex: 70,
            }}
            className="rounded-lg border border-border bg-muted shadow-md"
          >
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              onSelect={(d) => {
                if (d) {
                  const iso = format(d, "yyyy-MM-dd");
                  onChange(iso);
                }
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
