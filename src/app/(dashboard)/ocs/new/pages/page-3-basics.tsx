"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStep, uploadOcPhoto, removeOcPhoto, getPhotoPublicUrl, type DraftJson } from "../actions";

// tier classification still happens — at completeWizard time. The wizard UI
// no longer surfaces the tier badge; the visible flag here is just whether
// the OC is services-only (which forces Tier 5 on the back end).


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
  // Services-only support is deferred — feature parity isn't built yet, so
  // we preserve whatever value an existing draft holds but never change it
  // from the UI. New drafts arrive as false. See item 6 of the May refresh.
  const servicesOnly = initialDraft.services_only ?? false;
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    (initialDraft.billing_cycle as BillingCycle | undefined) ?? "quarterly",
  );
  const [pending, setPending] = useState(false);
  const [photoKey, setPhotoKey] = useState<string | null>(initialPhotoKey);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  // Each photo selection gets a unique upload id. handleRemovePhoto bumps
  // the id when it fires mid-upload; the in-flight upload watches the id
  // and bails (with a server-side cleanup) when it changes underneath it.
  // Using a ref instead of state because the upload closure captures the
  // value at start time — state would never see the post-click update.
  const uploadIdRef = useRef(0);

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
    // Take a snapshot of the current upload id so we can detect a cancel
    // (handleRemovePhoto bumps the global counter, this local copy stays).
    uploadIdRef.current += 1;
    const myUploadId = uploadIdRef.current;

    // Optimistic preview — paint the chosen image immediately under a dim
    // overlay + spinner so the user sees their photo while we compress and
    // upload. We use an object URL of the source file (or the HEIC-decoded
    // version if needed); KEEP that blob URL on display until the R2 URL is
    // fully loaded — swapping `src` to a not-yet-loaded R2 URL is the
    // "flash to blank then back" that managers were seeing.
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
      activeBlobUrlRef.current = previewUrl;
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
        activeBlobUrlRef.current = null;
        setPhotoUrl(null);
      }
      toast.error("Photo is too large even after compression. Try a smaller image.");
      return;
    }
    const fd = new FormData();
    fd.append("file", upload);
    if (thumb) fd.append("thumb", thumb);
    const r = await uploadOcPhoto(draftId, fd);

    // Cancel check (ref-based — captures the latest value, unlike the old
    // state-based check). If the user clicked trash mid-upload, our id is
    // stale; clean up the just-persisted photo from R2 and bail without
    // touching React state (handleRemovePhoto already cleared it).
    if (uploadIdRef.current !== myUploadId) {
      if (r.storage_key) void removeOcPhoto(draftId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      return;
    }

    if (r.error || !r.storage_key) {
      setPhotoUploading(false);
      toast.error(r.error ?? "Couldn't save the photo.");
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        activeBlobUrlRef.current = null;
        setPhotoUrl(null);
      }
      return;
    }

    // Save the storage key first so the trash icon below switches to the
    // server-delete branch. Then preload the R2 URL in a hidden Image() —
    // only swap `photoUrl` to the R2 URL once the image bytes are decoded.
    // This eliminates the "blob → blank → R2" flash entirely.
    setPhotoKey(r.storage_key);
    const r2Url = r.public_url ?? null;
    if (r2Url) {
      const preloader = new Image();
      preloader.onload = () => {
        // Re-check cancel — the user might have clicked trash AFTER the
        // upload returned but BEFORE the preloader fired. If so, drop the
        // swap and clean up.
        if (uploadIdRef.current !== myUploadId) {
          void removeOcPhoto(draftId);
          return;
        }
        setPhotoUrl(r2Url);
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
          if (activeBlobUrlRef.current === previewUrl) activeBlobUrlRef.current = null;
        }
        setPhotoUploading(false);
      };
      preloader.onerror = () => {
        if (uploadIdRef.current !== myUploadId) return;
        // R2 URL didn't load (CDN propagation, network blip). Keep showing
        // the local blob — it's still valid until the page reloads.
        setPhotoUploading(false);
      };
      preloader.src = r2Url;
    } else {
      setPhotoUploading(false);
    }
  }

  // Plain DB update; no loading state because the network round-trip is
  // fast and a spinner inside the photo slot just causes flicker on what's
  // already an instant action.
  async function handleRemovePhoto() {
    // Bump the upload id so any in-flight upload sees a mismatch when it
    // returns and tears itself down (incl. removing the just-uploaded R2
    // object). This must happen BEFORE clearing other state so the upload
    // closure's pending return doesn't race past us and re-render the photo.
    uploadIdRef.current += 1;
    // Optimistically clear the UI so the click feels instant.
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    setPhotoUploading(false);
    setPhotoKey(null);
    setPhotoUrl(null);
    // Always fire the server delete — covers the saved-photo case AND the
    // mid-upload case (the upload's own bail-out also fires a delete; both
    // are idempotent so the second one's a no-op).
    const r = await removeOcPhoto(draftId);
    if (r.error) toast.error(r.error);
  }

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
                {/* Trash stays visible during upload — clicking aborts and
                    cleans up. Stops the user from feeling locked in once
                    they realise the wrong photo is on the way up. */}
                {(photoKey || photoUploading) && (
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

          {/* Services-only flag is plumbed through draft_json (default false)
              but no longer exposed in the UI — the feature isn't supported
              in MVP and the checkbox just confused managers. Hidden until
              we ship the services-only compliance path. */}

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
  );
}
