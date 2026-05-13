"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadPlan, parseDraftWithGemini, skipParsing } from "../actions";

type ParseStatus = "idle" | "uploading" | "parsing" | "complete" | "failed";

export function Page1Upload({
  draftId,
  initialStatus,
  initialFilename,
  initialOcCount,
  initialLotCount,
  onNext,
}: {
  draftId: string;
  initialStatus: "none" | "pending" | "complete" | "failed" | "skipped";
  initialFilename: string | null;
  initialOcCount: number;
  initialLotCount: number;
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
    onNext();
  }

  const busy = status === "uploading" || status === "parsing";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Upload your plan of subdivision</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll auto-extract the OC details, lot schedule, and entitlements.
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
            isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"
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
                Reading your plan… extracting lot schedule. This usually takes 10–30 seconds.
              </p>
            )}
            {status === "complete" && (
              <p className="text-xs text-foreground">
                Plan parsed successfully — found{" "}
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
          file with the X to re-enable. */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy || skipping || !!filename}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {skipping ? "Loading…" : "Skip and enter manually"}
        </button>
        <Button
          type="button"
          onClick={onNext}
          disabled={status !== "complete" && status !== "failed"}
        >
          Continue
        </Button>
      </div>

    </div>
  );
}
