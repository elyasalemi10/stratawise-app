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
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  error,
  id,
  placeholder = "Pick a date",
  disabled,
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

  // SSR-safe "are we in the browser" check via useSyncExternalStore , no
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
      // Calendar ≈ 300×340. Clamp `left` so the popup never spills past
      // the viewport on either side (8px gutter). If the natural left
      // would push it off-screen-right, align the calendar's right edge to
      // the trigger's right edge instead.
      const CALENDAR_W = 300;
      const CALENDAR_H = 340;
      const GUTTER = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.left;
      if (left + CALENDAR_W + GUTTER > vw) {
        left = Math.max(GUTTER, rect.right - CALENDAR_W);
      }
      if (left < GUTTER) left = GUTTER;

      // Flip above the trigger when there isn't enough room beneath it.
      // Otherwise the calendar gets clipped by the viewport bottom.
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      let top: number;
      if (spaceBelow < CALENDAR_H + GUTTER && spaceAbove > spaceBelow) {
        top = Math.max(GUTTER, rect.top - CALENDAR_H - 4);
      } else {
        top = rect.bottom + 4;
      }
      setPosition({
        top,
        left,
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
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-start rounded-md border bg-card px-3 text-sm font-normal",
          error ? "border-destructive" : "border-border",
          !value && "text-muted-foreground",
          !disabled && "hover:border-primary/50",
          disabled && "cursor-not-allowed opacity-60",
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
              zIndex: 70,
            }}
          >
            {/* Plain Calendar inside a `rounded-lg border` container , same
                shape as the shadcn demo. Calendar paints its own bg-card so
                the surrounding border is the only chrome. */}
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
              className="rounded-lg border border-border shadow-md"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
