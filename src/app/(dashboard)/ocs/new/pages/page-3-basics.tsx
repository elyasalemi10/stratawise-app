"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, X, ImagePlus } from "lucide-react";
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

// Re-encode an image client-side as JPEG, scaling so the long edge is at most
// maxEdge. Returns the original file unchanged if it's already small enough
// or if the decode/encode fails (e.g. HEIC the browser can't read).
async function downscaleImage(file: File, maxEdge: number, quality: number): Promise<File> {
  if (typeof window === "undefined" || typeof document === "undefined") return file;
  if (file.size < 1_500_000) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const ratio = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    if (ratio >= 1) return file;
    const w = Math.round(img.naturalWidth * ratio);
    const h = Math.round(img.naturalHeight * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.(heic|heif|png|webp)$/i, ".jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
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
    let upload: File = file;
    try {
      upload = await downscaleImage(file, 1600, 0.82);
    } catch (err) {
      console.warn("Photo downscale failed; uploading original.", err);
    }
    if (upload.size > 10 * 1024 * 1024) {
      setPhotoUploading(false);
      toast.error("Photo is too large even after compression. Try a smaller image.");
      return;
    }
    const fd = new FormData();
    fd.append("file", upload);
    const r = await uploadOcPhoto(draftId, fd);
    setPhotoUploading(false);
    if (r.error || !r.storage_key) {
      toast.error(r.error ?? "Couldn't save the photo.");
      return;
    }
    setPhotoKey(r.storage_key);
    setPhotoUrl(r.public_url ?? null);
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
            <Label htmlFor="oc-title">
              Title <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="oc-title"
              placeholder="Friendly building or development name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Photo of the OC. JPEG/PNG/WebP, 10MB cap. Stored in R2 under
              logos/{companyId}/oc-photos/ and copied to the OC row on
              completion. Optional — managers can add later from settings. */}
          <div className="space-y-1.5">
            <Label>
              Photo <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            {photoKey && photoUrl ? (
              <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="OC photo"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    A picture of the building or site shown on dashboards and notices.
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={photoUploading}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={photoUploading}
                      onClick={handleRemovePhoto}
                      aria-label="Remove photo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {photoUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
                <span>
                  {photoUploading ? "Uploading…" : "Click to upload a photo"}
                </span>
                <span className="text-xs">JPEG, PNG, or WebP. Max 10MB.</span>
              </button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
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

          {/* Financial year start — month picker. We always anchor to day 1.
              Base-UI Select's SelectValue defaults to the bare option value
              ("7" for July) unless you pass a children renderer; we resolve to
              the label explicitly so the trigger shows "July" not "7". */}
          <div className="space-y-1.5">
            <Label htmlFor="fy-start">Financial year start</Label>
            <Select
              value={String(fyMonth)}
              onValueChange={(v) => setFyMonth(parseInt(v ?? "7", 10))}
            >
              <SelectTrigger id="fy-start" className="w-48">
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
        </div>

        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
          <Button type="button" onClick={onContinue} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Continue
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
