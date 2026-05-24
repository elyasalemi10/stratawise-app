"use client";

import { useEffect, useState } from "react";
import { Pipette } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface BrandColourPickerProps {
  value: string;        // "#RRGGBB" or "" for unset
  onChange: (hex: string) => void;
  id?: string;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

// A few brand-friendly preset chips for quick selection.
const PRESETS = [
  "#0E314C", // midnight (StrataWise brand)
  "#CFA753", // gold
  "#1E88E5", // blue
  "#43A047", // green
  "#E53935", // red
  "#FB8C00", // orange
  "#8E24AA", // purple
  "#37474F", // slate
];

/**
 * Just a swatch , no text input on the form. Click the swatch → popover
 * opens with hex input + native colour wheel + a row of presets. The
 * picker writes back through onChange whenever a valid hex is entered.
 *
 * Pre-fill (when onChange is fired externally , e.g. by logo extraction)
 * just updates the swatch colour through value.
 */
export function BrandColourPicker({ value, onChange, id }: BrandColourPickerProps) {
  const [draft, setDraft] = useState(value);

  // Keep draft in sync if the parent updates value (e.g. after auto-extract)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const validHex = HEX_RE.test(draft);
  const swatchColour = HEX_RE.test(value) ? value : "transparent";

  function commit(hex: string) {
    setDraft(hex);
    if (HEX_RE.test(hex)) onChange(hex.toUpperCase());
  }

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        className={cn(
          "group flex h-10 w-16 items-center justify-center rounded-md border border-border transition-colors hover:border-foreground/30",
          !value && "bg-[repeating-conic-gradient(#E5E0D3_0%_25%,#FAF7F0_25%_50%)] bg-[length:12px_12px]",
        )}
        style={value ? { backgroundColor: swatchColour } : undefined}
        aria-label="Open colour picker"
      >
        {!value && (
          <Pipette className="size-4 text-muted-foreground/70 group-hover:text-foreground" />
        )}
      </PopoverTrigger>

      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label
              className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
              style={{ backgroundColor: HEX_RE.test(draft) ? draft : "#FFFFFF" }}
              aria-label="Open OS colour wheel"
            >
              <input
                type="color"
                value={HEX_RE.test(draft) ? draft : "#000000"}
                onChange={(e) => commit(e.target.value.toUpperCase())}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <div className="flex-1">
              <div className="text-xs font-medium text-muted-foreground mb-1">Hex</div>
              <input
                type="text"
                value={draft}
                placeholder="#0E314C"
                maxLength={7}
                spellCheck={false}
                onChange={(e) => {
                  let v = e.target.value.toUpperCase();
                  if (v && !v.startsWith("#")) v = "#" + v;
                  setDraft(v);
                  if (HEX_RE.test(v)) onChange(v);
                }}
                className={cn(
                  "h-8 w-full rounded-md border bg-background px-2 font-mono text-xs uppercase tracking-wider outline-none focus:ring-2",
                  !draft || validHex
                    ? "border-border focus:ring-primary/20 focus:border-primary"
                    : "border-destructive focus:ring-destructive/20",
                )}
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Presets</div>
            <div className="grid grid-cols-8 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => commit(p)}
                  className="h-6 w-6 rounded-md border border-border transition-transform hover:scale-110"
                  style={{ backgroundColor: p }}
                  aria-label={`Use ${p}`}
                />
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
