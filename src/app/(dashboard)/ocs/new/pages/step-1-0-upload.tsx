"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadPlan, parseDraftWithGemini, selectDetectedOc, skipParsing } from "../actions";

// Wizard Step 1 sub-step 0 — Upload chooser.
//
// Renders inline inside the General progress-bar slot (not as a popup). The
// manager either uploads a plan PDF (button, not dropzone) or clicks
// "Continue manually" to advance with empty fields. Multi-OC plans surface
// an inline chooser block once parsing finishes.

interface DetectedOcLite {
  oc_number: number;
  lot_count: number;
  oc_name?: string | null;
}

type Phase = "idle" | "uploading" | "parsing" | "complete" | "failed";

export function Step1Upload({
  draftId,
  initialStatus,
  initialFilename,
  initialDetectedOcs,
  onNext,
}: {
  draftId: string;
  initialStatus: "none" | "pending" | "complete" | "failed" | "skipped";
  initialFilename: string | null;
  initialDetectedOcs: DetectedOcLite[];
  onNext: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(() => {
    if (initialStatus === "complete") return "complete";
    if (initialStatus === "failed") return "failed";
    return "idle";
  });
  const [filename, setFilename] = useState<string | null>(initialFilename);
  const [detectedOcs, setDetectedOcs] = useState<DetectedOcLite[]>(initialDetectedOcs);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [continuePending, setContinuePending] = useState(false);
  const [chooserChoice, setChooserChoice] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are accepted");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File exceeds 50MB");
      return;
    }
    setFilename(file.name);
    setPhase("uploading");
    setParseError(null);

    const fd = new FormData();
    fd.append("file", file);
    const up = await uploadPlan(draftId, fd);
    if (up.error) {
      toast.error(up.error);
      setPhase("failed");
      setParseError(up.error);
      return;
    }
    setPhase("parsing");
    const parse = await parseDraftWithGemini(draftId);
    if (parse.error) {
      setPhase("failed");
      setParseError(parse.error);
      return;
    }
    setPhase("complete");
    setDetectedOcs(parse.detectedOcs ?? []);
  }

  async function onContinue() {
    setContinuePending(true);
    // Multi-OC plan: persist the chosen OC into draft_json before advancing.
    if (detectedOcs.length > 1) {
      const r = await selectDetectedOc(draftId, chooserChoice);
      if (r.error) {
        setContinuePending(false);
        toast.error(r.error);
        return;
      }
    }
    onNext();
  }

  async function onContinueManually() {
    setSkipping(true);
    const r = await skipParsing(draftId);
    if (r.error) {
      toast.error(r.error);
      setSkipping(false);
      return;
    }
    onNext();
  }

  const busy = phase === "uploading" || phase === "parsing";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Upload your plan of subdivision</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll read your document and pre-fill the OC details, lot schedule, and entitlements. You can skip this and{" "}
          <span className="font-medium text-[color:var(--brand-gold)]">enter everything manually</span>.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {phase === "idle" && !filename && (
        // Whole dropzone is one click target — click anywhere inside opens
        // the file picker. Drag + drop also wired so a PDF dropped onto the
        // panel triggers the upload directly.
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-md border-2 border-dashed border-border bg-card px-4 py-10 outline-none transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            Drop or click to upload your plan of subdivision
          </p>
          <p className="text-xs text-muted-foreground">PDF · up to 50 MB</p>
        </div>
      )}

      {filename && (
        <div className="rounded-md border border-border bg-card p-5">
          <div className="flex flex-col items-center text-center gap-3">
            {busy ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : phase === "complete" ? (
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            )}
            <div className="flex items-center gap-2 max-w-full">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium text-foreground truncate">{filename}</p>
            </div>
            {phase === "uploading" && <p className="text-xs text-muted-foreground">Uploading…</p>}
            {phase === "parsing" && (
              <p className="text-xs text-muted-foreground">
                Reading your plan. This usually takes 10–30 seconds.
              </p>
            )}
            {phase === "complete" && (
              <p className="text-xs text-foreground">
                Plan read successfully{detectedOcs.length > 1 ? ` — found ${detectedOcs.length} OCs on this plan` : ""}.
              </p>
            )}
            {phase === "failed" && parseError && (
              <p className="text-xs text-amber-700">{parseError}</p>
            )}
          </div>
        </div>
      )}

      {/* Inline multi-OC chooser. Only renders when the parsed plan exposed
          more than one OC. Manager picks which one to set up first; the
          others stay in parsed_json.detected_ocs for the "Create the next
          OC" prompt after completeWizard. */}
      {phase === "complete" && detectedOcs.length > 1 && (
        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <Label className="text-sm font-semibold text-foreground">
            This plan defines {detectedOcs.length} owners corporations — pick the first to set up:
          </Label>
          <div className="space-y-1.5">
            {detectedOcs.map((o, i) => {
              const checked = chooserChoice === i;
              return (
                <button
                  key={o.oc_number}
                  type="button"
                  onClick={() => setChooserChoice(i)}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm cursor-pointer ${
                    checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="font-medium">
                    OC{o.oc_number}{o.oc_name ? ` — ${o.oc_name}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">{o.lot_count} lots</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onContinueManually}
          disabled={busy || skipping || continuePending}
        >
          {skipping && <Loader2 className="size-4 animate-spin" />}
          Continue manually
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={(phase !== "complete" && phase !== "failed") || continuePending}
        >
          {continuePending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
