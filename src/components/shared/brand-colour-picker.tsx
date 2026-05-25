"use client";

import { useEffect, useMemo, useState } from "react";
import { Pipette } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

interface BrandColourPickerProps {
  value: string;        // "#RRGGBB" or "" for unset
  onChange: (hex: string) => void;
  id?: string;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

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

// ── Colour conversions ─────────────────────────────────────────
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  if (!HEX_RE.test(hex)) return { h: 0, s: 0, l: 0 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = h / 360;
  const ss = s / 100;
  const ll = l / 100;
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  function hue2rgb(t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  const r = Math.round(hue2rgb(hh + 1 / 3) * 255);
  const g = Math.round(hue2rgb(hh) * 255);
  const b = Math.round(hue2rgb(hh - 1 / 3) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Self-contained brand colour picker. Click the swatch → popover opens with:
 *   - HSL hue + saturation + lightness sliders (full coverage, no canvas)
 *   - Hex text input (validates + commits live)
 *   - 8 brand-friendly preset chips
 *   - Native OS colour wheel for users who prefer it
 *
 * No backdrop grey-out (showBackdrop=false on PopoverContent) so the
 * surroundings stay legible while picking.
 */
export function BrandColourPicker({ value, onChange, id }: BrandColourPickerProps) {
  const [draft, setDraft] = useState(value || "#0E314C");
  useEffect(() => {
    if (HEX_RE.test(value)) setDraft(value);
  }, [value]);

  const validHex = HEX_RE.test(draft);
  const hsl = useMemo(() => (validHex ? hexToHsl(draft) : { h: 0, s: 0, l: 0 }), [draft, validHex]);
  const swatchColour = HEX_RE.test(value) ? value : "transparent";

  function commit(hex: string) {
    const up = hex.toUpperCase();
    setDraft(up);
    if (HEX_RE.test(up)) onChange(up);
  }

  function updateHsl(next: { h?: number; s?: number; l?: number }) {
    const h = next.h ?? hsl.h;
    const s = next.s ?? hsl.s;
    const l = next.l ?? hsl.l;
    commit(hslToHex(h, s, l));
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

      {/* showBackdrop={false} , no grey-out wash behind the popover. */}
      <PopoverContent className="w-72 p-4 space-y-4" align="start" showBackdrop={false}>
        {/* Preview + hex row */}
        <div className="flex items-center gap-3">
          <label
            className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
            style={{ backgroundColor: validHex ? draft : "#FFFFFF" }}
            aria-label="OS colour wheel"
          >
            <input
              type="color"
              value={validHex ? draft : "#000000"}
              onChange={(e) => commit(e.target.value)}
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

        {/* HSL sliders , every colour in the wheel reachable without a
            canvas. */}
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Hue</span>
              <span className="font-mono text-foreground">{hsl.h}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              value={hsl.h}
              onChange={(e) => updateHsl({ h: Number(e.target.value) })}
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))",
              }}
              aria-label="Hue"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Saturation</span>
              <span className="font-mono text-foreground">{hsl.s}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={hsl.s}
              onChange={(e) => updateHsl({ s: Number(e.target.value) })}
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, hsl(${hsl.h},0%,${hsl.l}%), hsl(${hsl.h},100%,${hsl.l}%))`,
              }}
              aria-label="Saturation"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Lightness</span>
              <span className="font-mono text-foreground">{hsl.l}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={hsl.l}
              onChange={(e) => updateHsl({ l: Number(e.target.value) })}
              className="h-2 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, hsl(${hsl.h},${hsl.s}%,0%), hsl(${hsl.h},${hsl.s}%,50%), hsl(${hsl.h},${hsl.s}%,100%))`,
              }}
              aria-label="Lightness"
            />
          </div>
        </div>

        {/* Brand presets */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Presets</div>
          <div className="grid grid-cols-8 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => commit(p)}
                className={cn(
                  "h-6 w-6 rounded-md border transition-transform hover:scale-110",
                  value === p ? "border-foreground ring-2 ring-primary/40" : "border-border",
                )}
                style={{ backgroundColor: p }}
                aria-label={`Use ${p}`}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
