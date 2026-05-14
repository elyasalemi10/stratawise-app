"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadPlan, parseDraftWithGemini, selectDetectedOc, skipParsing } from "../actions";

interface DetectedOcLite {
  oc_number: number;
  lot_count: number;
  oc_name?: string | null;
}

type ParseStatus = "idle" | "uploading" | "parsing" | "complete" | "failed";

export function Page1Upload({
  draftId,
  initialStatus,
  initialFilename,
  initialOcCount,
  initialLotCount,
  initialDetectedOcs,
  onNext,
}: {
  draftId: string;
  initialStatus: "none" | "pending" | "complete" | "failed" | "skipped";
  initialFilename: string | null;
  initialOcCount: number;
  initialLotCount: number;
  /** Full list of OCs Gemini found in the plan. Used to drive the
   *  multi-OC chooser dialog before advancing to page 2. */
  initialDetectedOcs: DetectedOcLite[];
  onNext: () => void;
}) {
  const [status, setStatus] = useState<ParseStatus>(
    initialStatus === "complete" ? "complete"
    : initialStatus === "failed" ? "failed"
    : "idle",
  );
  const [filename, setFilename] = useState<string | null>(initialFilename);
  const [ocCount, setOcCount] = useState(initialOcCount);
  const [lotCount, setLotCount] = useState(initialLotCount);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Multi-OC chooser. When the parse detects >1 OC on the plan we open this
  // dialog before advancing to page 2 so the manager picks which OC seeds
  // the lot schedule + address prefill.
  const [detectedOcs, setDetectedOcs] = useState<DetectedOcLite[]>(initialDetectedOcs);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [chooserChoice, setChooserChoice] = useState<number>(0);
  const [chooserPending, setChooserPending] = useState(false);
  // Counter pattern for nested drag-leave: the browser fires dragleave when
  // moving over a child element, which would close the highlight prematurely.
  // We only flip back to !dragging when the counter reaches 0.
  const dragDepthRef = useRef(0);

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
    setStatus("uploading");
    setParseError(null);

    const fd = new FormData();
    fd.append("file", file);
    const up = await uploadPlan(draftId, fd);
    if (up.error) {
      toast.error(up.error);
      setStatus("failed");
      setParseError(up.error);
      return;
    }

    setStatus("parsing");
    const parse = await parseDraftWithGemini(draftId);
    if (parse.error) {
      setStatus("failed");
      setParseError(parse.error);
      return;
    }
    setStatus("complete");
    setOcCount(parse.ocCount ?? 0);
    setLotCount(parse.lotCount ?? 0);
    setDetectedOcs(parse.detectedOcs ?? []);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }
  function onDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  async function onSkip() {
    setSkipping(true);
    const r = await skipParsing(draftId);
    if (r.error) {
      toast.error(r.error);
      setSkipping(false);
      return;
    }
    // Keep the skipping spinner up while onNext refreshes the draft and
    // transitions to the next step; the component will unmount.
    await onNext();
  }

  // Local pending flag for Continue. Mirrors the spinner+disable pattern
  // used on later steps so the button doesn't look dead after click.
  const [continuePending, setContinuePending] = useState(false);
  async function onContinue() {
    // Multi-OC plan: pause for the chooser before page 2. Otherwise advance
    // straight away — the parse already seeded the first detected OC into
    // draft_json.
    if (detectedOcs.length > 1) {
      setChooserChoice(0);
      setChooserOpen(true);
      return;
    }
    setContinuePending(true);
    try {
      await onNext();
    } finally {
      setContinuePending(false);
    }
  }

  async function confirmDetectedOcChoice() {
    setChooserPending(true);
    const r = await selectDetectedOc(draftId, chooserChoice);
    if (r.error) {
      setChooserPending(false);
      toast.error(r.error);
      return;
    }
    setChooserOpen(false);
    setChooserPending(false);
    await onNext();
  }

  const busy = status === "uploading" || status === "parsing";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Upload your plan of subdivision</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll read your document and fill in the OC details, lot schedule, and entitlements for you.
          You can skip this and enter everything manually.
        </p>
      </div>

      {/* Upload dropzone — hidden once a file is uploaded; reappears when cleared. */}
      {!filename && (
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`relative rounded-lg border-2 border-dashed transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-10">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                // Reset the input so re-uploading the same file after clearing works.
                e.target.value = "";
              }}
            />
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {isDragging ? "Drop the PDF here" : "Click to browse or drag a PDF here"}
            </p>
          </label>
        </div>
      )}

      {/* Status panel — centered, single spinner, no left/right loading bar. */}
      {filename && status !== "idle" && (
        <div className="relative rounded-md border border-border bg-card p-6">
          <div className="flex flex-col items-center text-center gap-3">
            {status === "uploading" || status === "parsing" ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : status === "complete" ? (
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            )}
            <div className="flex items-center justify-center gap-2 max-w-full">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium text-foreground truncate">{filename}</p>
            </div>
            {status === "uploading" && (
              <p className="text-xs text-muted-foreground">Uploading…</p>
            )}
            {status === "parsing" && (
              <p className="text-xs text-muted-foreground">
                Reading your plan and pulling out the lot schedule. This usually takes 10–30 seconds.
              </p>
            )}
            {status === "complete" && (
              <p className="text-xs text-foreground">
                Plan read successfully — found{" "}
                <span className="font-medium">{lotCount} lot{lotCount === 1 ? "" : "s"}</span>
                {ocCount > 1 && (
                  <> across <span className="font-medium">{ocCount} OCs</span></>
                )}
                .
              </p>
            )}
            {status === "failed" && parseError && (
              <p className="text-xs text-amber-700">{parseError}</p>
            )}
            {!busy && (
              <button
                type="button"
                onClick={() => { setStatus("idle"); setFilename(null); setParseError(null); }}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label="Clear upload"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Buttons. Skip is greyed out once a PDF has been uploaded — clear the
          file with the X to re-enable. Continue stays disabled until parse
          finishes or fails (a failed parse still lets the user continue and
          fix the lot schedule manually on page 2). */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy || skipping || !!filename}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {skipping && <Loader2 className="size-3.5 animate-spin" />}
          Skip and enter manually
        </button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={(status !== "complete" && status !== "failed") || continuePending}
        >
          {continuePending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>

      {/* Multi-OC chooser. Fires when the plan defines >1 OC and the user
          clicks Continue. The chosen OC seeds page 2; the others are kept
          in parsed_json.detected_ocs so they can be promoted later via the
          "Create the next OC" prompt at wizard completion. */}
      <Dialog
        open={chooserOpen}
        onOpenChange={(open) => { if (!chooserPending) setChooserOpen(open); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This plan defines {detectedOcs.length} owners corporations</DialogTitle>
            <DialogDescription>
              Pick the OC you&apos;re setting up first. We&apos;ll seed page 2 with its
              address and lot schedule. You can create the others later from the same plan.
            </DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <Button variant="ghost" onClick={() => setChooserOpen(false)} disabled={chooserPending}>Cancel</Button>
            <Button onClick={confirmDetectedOcChoice} disabled={chooserPending}>
              {chooserPending && <Loader2 className="size-4 animate-spin" />}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
