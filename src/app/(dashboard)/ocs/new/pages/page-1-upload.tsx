"use client";

import { useState } from "react";
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
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
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

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-lg border-2 border-dashed transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"
        } ${busy ? "pointer-events-none opacity-60" : ""}`}
      >
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-10">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {isDragging ? "Drop the PDF here" : "Click to browse or drag a PDF here"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF up to 50MB. Usually titled &ldquo;PS123456X.pdf&rdquo; from Land Use Victoria or your conveyancer.
            </p>
          </div>
        </label>
      </div>

      {/* Status panel */}
      {filename && status !== "idle" && (
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            {status === "uploading" || status === "parsing" ? (
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
            ) : status === "complete" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium text-foreground truncate">{filename}</p>
              </div>
              {status === "uploading" && (
                <p className="mt-1 text-xs text-muted-foreground">Uploading…</p>
              )}
              {status === "parsing" && (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reading your plan… extracting lot schedule. This usually takes 10–30 seconds.
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] rounded-full bg-primary" />
                  </div>
                </>
              )}
              {status === "complete" && (
                <p className="mt-1 text-xs text-foreground">
                  Plan parsed successfully — found{" "}
                  <span className="font-medium">{lotCount} lot{lotCount === 1 ? "" : "s"}</span>
                  {ocCount > 1 && (
                    <> across <span className="font-medium">{ocCount} OCs</span></>
                  )}
                  .
                </p>
              )}
              {status === "failed" && (
                <>
                  <p className="mt-1 text-xs text-amber-700">
                    We couldn&apos;t read this plan automatically.{" "}
                    {parseError && <span className="text-muted-foreground">({parseError})</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can continue and enter details manually.
                  </p>
                </>
              )}
            </div>
            {!busy && (
              <button
                type="button"
                onClick={() => { setStatus("idle"); setFilename(null); setParseError(null); }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear upload"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy || skipping}
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer"
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

      <style jsx global>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
