"use client";

import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

interface LogoUploadProps {
  value: string;
  onChange: (url: string) => void;
  /** Fires once a logo is uploaded with the dominant brand colour as
   *  "#RRGGBB" or null if extraction failed. We run this BEFORE the
   *  upload using a local blob URL so R2 CORS doesn't matter. */
  onColourExtracted?: (hex: string | null) => void;
}

/** Pick a representative non-grey colour from an image's centre region by
 *  drawing at 60x60 and bucketing pixels at 32-step RGB quantisation. */
async function extractDominantColour(objectUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
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
          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 16 && g < 16 && b < 16) continue;
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
          if (c > bestCount) { best = k; bestCount = c; }
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
    img.src = objectUrl;
  });
}

export function LogoUpload({ value, onChange, onColourExtracted }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.match(/^image\/(png|jpe?g|svg\+xml|webp|avif|gif|bmp|heic|heif)$/)) {
      toast.error("Use PNG, JPG, SVG, WebP, AVIF, GIF, BMP or HEIC.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum 2MB.");
      return;
    }

    // Extract dominant colour from the local File BEFORE upload so we
    // don't depend on R2 CORS for the canvas read.
    if (onColourExtracted && file.type !== "image/svg+xml") {
      const objectUrl = URL.createObjectURL(file);
      extractDominantColour(objectUrl).then((hex) => {
        onColourExtracted(hex);
        URL.revokeObjectURL(objectUrl);
      });
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }

      onChange(data.url);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-1.5">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Company logo"
            className="h-16 max-w-[200px] object-contain rounded-md border border-border"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/90"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          disabled={uploading}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/50",
            dragOver && "border-primary bg-primary/5",
            uploading && "opacity-50 cursor-not-allowed"
          )}
        >
          {uploading ? (
            <>
              <Spinner />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Drop logo here or click to upload
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/avif,image/gif,image/bmp,image/heic,image/heif,.png,.jpg,.jpeg,.svg,.webp,.avif,.gif,.bmp,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

    </div>
  );
}
