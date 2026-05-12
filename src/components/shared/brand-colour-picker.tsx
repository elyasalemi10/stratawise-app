"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface BrandColourPickerProps {
  value: string;                    // "#RRGGBB" or "" for unset
  onChange: (hex: string) => void;
  logoUrl?: string;                 // if present, try to auto-extract once
  id?: string;
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/**
 * Tries to pick a representative non-grey colour from an image by sampling
 * the centre region at low resolution and bucketing pixels into a 32-step
 * RGB cube. Returns "#RRGGBB" or null on failure. Pure client side; the
 * image is fetched as <img> with crossOrigin="anonymous" so it must be
 * served with permissive CORS (our R2 bucket is configured for this).
 */
async function extractDominantColour(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        canvas.width = 60;
        canvas.height = 60;
        ctx.drawImage(img, 0, 0, 60, 60);
        const data = ctx.getImageData(0, 0, 60, 60).data;
        const buckets = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          // Skip near-white and near-black so a watermark/background doesn't win.
          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 16 && g < 16 && b < 16) continue;
          // Bucket by 32-step quantisation
          const qr = Math.floor(r / 32) * 32;
          const qg = Math.floor(g / 32) * 32;
          const qb = Math.floor(b / 32) * 32;
          const key = `${qr},${qg},${qb}`;
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        if (buckets.size === 0) return resolve(null);
        let best = "";
        let bestCount = 0;
        for (const [k, c] of buckets) {
          if (c > bestCount) {
            best = k;
            bestCount = c;
          }
        }
        const [r, g, b] = best.split(",").map(Number);
        const hex =
          "#" +
          [r, g, b]
            .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
            .join("");
        resolve(hex);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function BrandColourPicker({ value, onChange, logoUrl, id }: BrandColourPickerProps) {
  const [textValue, setTextValue] = useState(value);
  const lastExtractedFor = useRef<string | null>(null);

  // Keep text input in sync if value is set externally
  useEffect(() => {
    setTextValue(value);
  }, [value]);

  // Auto-extract a colour when a logo URL appears (only the first time we
  // see each URL — don't re-extract on every render).
  useEffect(() => {
    if (!logoUrl) return;
    if (lastExtractedFor.current === logoUrl) return;
    if (value) {
      // User has already picked something; don't overwrite.
      lastExtractedFor.current = logoUrl;
      return;
    }
    lastExtractedFor.current = logoUrl;
    extractDominantColour(logoUrl).then((hex) => {
      if (hex) onChange(hex);
    });
  }, [logoUrl, value, onChange]);

  const validHex = HEX_RE.test(textValue);
  const swatchColour = validHex ? textValue : "#FFFFFF";

  return (
    <div className="flex items-center gap-2">
      <label
        className="relative h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border"
        style={{ backgroundColor: swatchColour }}
      >
        <input
          type="color"
          value={validHex ? textValue : "#000000"}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setTextValue(v);
            onChange(v);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Open colour picker"
        />
      </label>
      <input
        id={id}
        type="text"
        value={textValue}
        placeholder="#0E314C"
        maxLength={7}
        onChange={(e) => {
          let v = e.target.value.toUpperCase();
          if (v && !v.startsWith("#")) v = "#" + v;
          setTextValue(v);
          if (HEX_RE.test(v)) onChange(v);
        }}
        className={cn(
          "h-9 flex-1 rounded-md border bg-background px-3 font-mono text-sm uppercase tabular-nums transition-colors outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
          textValue && !validHex
            ? "border-destructive focus:border-destructive focus:ring-destructive/20"
            : "border-border",
        )}
      />
    </div>
  );
}
