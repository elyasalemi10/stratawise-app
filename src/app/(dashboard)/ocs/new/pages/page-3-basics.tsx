"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { saveStep, uploadOcPhoto, removeOcPhoto, getPhotoPublicUrl, type DraftJson } from "../actions";

function tierForLotCount(n: number, servicesOnly: boolean): number {
  if (servicesOnly) return 5;
  if (n >= 100) return 1;
  if (n >= 51) return 2;
  if (n >= 10) return 3;
  if (n >= 3) return 4;
  return 5;
}

// HEIC detection — covers iPhone's default camera output. The browser can't
// natively decode it, so we run it through heic2any (dynamic import to keep
// the bundle small on the rest of the wizard).
function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return type === "image/heic" || type === "image/heif"
    || name.endsWith(".heic") || name.endsWith(".heif");
}

async function heicToJpeg(file: File, quality: number): Promise<File> {
  const { default: heic2any } = await import("heic2any");
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality });
  // heic2any returns Blob | Blob[]; collapse arrays into the first frame.
  const out = Array.isArray(blob) ? blob[0] : blob;
  return new File([out], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
}

// Decode + canvas pipeline: load the file (after HEIC conversion if needed)
// to an HTMLImageElement so callers can resample at multiple sizes from one
// decode. Returns the working file (post-HEIC) too, so the caller can fall
// back to it if a re-encode fails.
async function decodeImage(file: File, fallbackQuality: number): Promise<{ img: HTMLImageElement; working: File } | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  let working = file;
  if (isHeic(file)) {
    working = await heicToJpeg(file, fallbackQuality);
  }
  const url = URL.createObjectURL(working);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    return { img, working };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Re-encode an image client-side as JPEG, scaling so the long edge is at most
// maxEdge. Decodes HEIC first if needed. Returns the original file unchanged
// if it's already small enough.
async function downscaleImage(file: File, maxEdge: number, quality: number): Promise<File> {
  const decoded = await decodeImage(file, quality);
  if (!decoded) return file;
  const { img, working } = decoded;
  if (working.size < 1_500_000) return working;
  const ratio = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  if (ratio >= 1) return working;
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return working;
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) return working;
  return new File([blob], working.name.replace(/\.(png|webp)$/i, ".jpg"), { type: "image/jpeg" });
}

// Centre-crop + resample for the sidebar swapper thumbnail. ~96x64 is enough
// for an inline dropdown row; we ship 192x128 (2x) so retina screens still
// look sharp.
async function makeThumbnail(file: File): Promise<File | null> {
  const decoded = await decodeImage(file, 0.85);
  if (!decoded) return null;
  const { img } = decoded;
  const targetW = 192;
  const targetH = 128;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  if (sw === 0 || sh === 0) return null;
  // Centre-crop to match the 3:2 target aspect ratio.
  const targetAspect = targetW / targetH;
  const sourceAspect = sw / sh;
  let cropW = sw;
  let cropH = sh;
  if (sourceAspect > targetAspect) {
    cropW = Math.round(sh * targetAspect);
  } else {
    cropH = Math.round(sw / targetAspect);
  }
  const cropX = Math.round((sw - cropW) / 2);
  const cropY = Math.round((sh - cropH) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.75));
  if (!blob) return null;
  return new File([blob], "thumb.jpg", { type: "image/jpeg" });
}

function tierColour(t: number): string {
  switch (t) {
    case 1: return "bg-red-100 text-red-900 border-red-300";
    case 2: return "bg-orange-100 text-orange-900 border-orange-300";
    case 3: return "bg-amber-100 text-amber-900 border-amber-300";
    case 4: return "bg-green-100 text-green-900 border-green-300";
    default: return "bg-blue-100 text-blue-900 border-blue-300";
  }
}

const MONTHS = [
  { value: 1,  label: "January" },
  { value: 2,  label: "February" },
  { value: 3,  label: "March" },
  { value: 4,  label: "April" },
  { value: 5,  label: "May" },
  { value: 6,  label: "June" },
  { value: 7,  label: "July" },
  { value: 8,  label: "August" },
  { value: 9,  label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const BILLING_CYCLES = [
  { value: "monthly",     label: "Monthly" },
  { value: "quarterly",   label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "annually",    label: "Annually" },
] as const;
type BillingCycle = typeof BILLING_CYCLES[number]["value"];

export function Page3Basics({
  draftId,
  initialDraft,
  initialPhotoKey,
  totalLots,
  onNext,
  onBack,
}: {
  draftId: string;
  initialDraft: DraftJson;
  initialPhotoKey: string | null;
  totalLots: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const [title, setTitle] = useState(initialDraft.trading_name ?? "");
  const [servicesOnly, setServicesOnly] = useState(initialDraft.services_only ?? false);
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    (initialDraft.billing_cycle as BillingCycle | undefined) ?? "quarterly",
  );
  const [pending, setPending] = useState(false);
  const [photoKey, setPhotoKey] = useState<string | null>(initialPhotoKey);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Resolve the public URL for a resumed draft once on mount. uploadOcPhoto
  // returns the URL inline so fresh uploads don't go through this path.
  useEffect(() => {
    if (initialPhotoKey) {
      void getPhotoPublicUrl(initialPhotoKey).then(setPhotoUrl);
    }
  }, [initialPhotoKey]);

  async function handlePhotoSelect(file: File) {
    // Phone photos are routinely 8-20MB at native resolution and the server
    // action transport adds noticeable latency above ~3MB. Downscale
    // client-side to a reasonable display size (max 1600px on the long edge,
    // re-encoded as JPEG q=0.82) before sending. Falls back to the raw file
    // if the canvas path errors out (rare — HEIC without browser decode).
    setPhotoUploading(true);

    // Optimistic preview — paint the chosen image immediately under a dim
    // overlay + spinner so the user sees their photo while we compress and
    // upload. We use an object URL of the source file (or the HEIC-decoded
    // version if needed); a real R2 URL replaces it once the upload returns.
    let previewSource: File = file;
    try {
      if (isHeic(file)) previewSource = await heicToJpeg(file, 0.82);
    } catch {
      // If HEIC decode fails we just skip the preview; the upload path will
      // still try and may produce a real error toast.
    }
    let previewUrl: string | null = null;
    try {
      previewUrl = URL.createObjectURL(previewSource);
      setPhotoUrl(previewUrl);
    } catch {
      // Object URLs only fail in weird sandboxed contexts; treat as no preview.
    }

    let upload: File = file;
    let thumb: File | null = null;
    try {
      upload = await downscaleImage(file, 1600, 0.82);
    } catch (err) {
      console.warn("Photo downscale failed; uploading original.", err);
    }
    try {
      thumb = await makeThumbnail(upload);
    } catch (err) {
      console.warn("Thumbnail generation failed; uploading without thumb.", err);
    }
    if (upload.size > 10 * 1024 * 1024) {
      setPhotoUploading(false);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPhotoUrl(null);
      }
      toast.error("Photo is too large even after compression. Try a smaller image.");
      return;
    }
    const fd = new FormData();
    fd.append("file", upload);
    if (thumb) fd.append("thumb", thumb);
    const r = await uploadOcPhoto(draftId, fd);
    setPhotoUploading(false);
    if (r.error || !r.storage_key) {
      toast.error(r.error ?? "Couldn't save the photo.");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPhotoUrl(null);
      }
      return;
    }
    setPhotoKey(r.storage_key);
    setPhotoUrl(r.public_url ?? null);
    // Now that the real R2 URL is in place we can release the local blob.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }

  async function handleRemovePhoto() {
    setPhotoUploading(true);
    const r = await removeOcPhoto(draftId);
    setPhotoUploading(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setPhotoKey(null);
    setPhotoUrl(null);
  }

  const tier = useMemo(() => tierForLotCount(totalLots, servicesOnly), [totalLots, servicesOnly]);

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, {
      trading_name: title || undefined,
      services_only: servicesOnly,
      financial_year_start_month: fyMonth,
      financial_year_start_day: 1,
      billing_cycle: billingCycle,
    }, 4);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-foreground">Tell us about this OC</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A few details that don&apos;t appear on the plan of subdivision.
          </p>
        </div>

        <div className="space-y-4">
          {/* Title (was "Trading name"). */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-title">Title</Label>
            <Input
              id="oc-title"
              placeholder="Friendly building or development name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Photo of the OC. JPEG/PNG/WebP/HEIC, 10MB cap (post-compression).
              Stored in R2 under logos/{companyId}/oc-photos/ and copied to the
              OC row on completion. */}
          <div className="space-y-1.5">
            <Label>Photo</Label>
            {/* While a photo is uploading we paint the image immediately
                (object URL of the local file, set in handlePhotoSelect) and
                dim it with a black/50 overlay + centered spinner. The image
                "fades in" to full colour the moment the upload returns. */}
            {photoUrl ? (
              <div className="relative overflow-hidden rounded-md border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="OC photo"
                  className="block w-full max-h-[420px] object-cover"
                />
                {photoUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
                    <Loader2 className="h-7 w-7 animate-spin text-white" />
                  </div>
                )}
                {photoKey && !photoUploading && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    aria-label="Remove photo"
                    className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-card/90 backdrop-blur-sm border border-border text-destructive hover:bg-card cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                // Empty-state dropzone matches the height of the loaded photo
                // preview (max-h-[420px]) so the layout doesn't snap / jump
                // when an image actually lands. Wide screens use the natural
                // image height; narrow screens fall back to a sensible 280px.
                className="flex h-[280px] w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-card/60 px-4 text-sm text-muted-foreground hover:bg-card hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 sm:h-[360px]"
              >
                <ImagePlus className="h-7 w-7" />
                <span>Click to upload a photo</span>
                <span className="text-xs">JPEG, PNG, WebP, or HEIC. Max 10MB.</span>
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePhotoSelect(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Tier — shadcn Tooltip with a larger, more legible body. */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Tier</span>
                <Tooltip>
                  <TooltipTrigger
                    aria-label="What is OC tier?"
                    className="inline-flex items-center text-muted-foreground hover:text-foreground"
                    style={{ cursor: "default" }}
                  >
                    <Info className="h-4 w-4" />
                  </TooltipTrigger>
                  {/* Override base-ui's default dark popup. The header is navy
                      already; the dark-on-dark tooltip vanishes. White card
                      with a 1px border + dark text reads cleanly against
                      either navy or the cream page bg. */}
                  <TooltipContent className="max-w-sm border border-border bg-popover p-3 text-sm leading-relaxed text-foreground shadow-sm">
                    <p className="font-medium">OC tier (Owners Corporations Act 2006)</p>
                    <p className="mt-1 text-muted-foreground">
                      Determines compliance requirements: audit obligations, 10-year maintenance
                      plans, and committee size. Tier 1 has the most obligations; Tier 5 the fewest.
                      Calculated from lot count.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${tierColour(tier)}`}>
                Tier {tier}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
              <Checkbox
                id="services-only"
                checked={servicesOnly}
                onCheckedChange={(v) => setServicesOnly(v === true)}
              />
              <Label className="text-sm font-normal">
                This is a services-only OC
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Financial year start — month picker. We always anchor to day 1. */}
            <div className="space-y-1.5">
              <Label htmlFor="fy-start">Financial year start</Label>
              <Select
                value={String(fyMonth)}
                onValueChange={(v) => setFyMonth(parseInt(v ?? "7", 10))}
              >
                <SelectTrigger id="fy-start" className="w-full">
                  <SelectValue placeholder="Pick a month">
                    {MONTHS.find((m) => m.value === fyMonth)?.label ?? "Pick a month"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Levy issuance cadence — drives when the levy cron fires. Most
                Victorian OCs run quarterly (matches the Owners Corporations
                Act levy notice cycle). Annually is rare but legal for very
                small OCs. */}
            <div className="space-y-1.5">
              <Label htmlFor="billing-cycle">Levy frequency</Label>
              <Select
                value={billingCycle}
                onValueChange={(v) => setBillingCycle((v as BillingCycle) ?? "quarterly")}
              >
                <SelectTrigger id="billing-cycle" className="w-full">
                  <SelectValue placeholder="Pick a frequency">
                    {BILLING_CYCLES.find((b) => b.value === billingCycle)?.label ?? "Pick a frequency"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="secondary" onClick={onBack} disabled={photoUploading}>Back</Button>
          <Button type="button" onClick={onContinue} disabled={pending || photoUploading}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
