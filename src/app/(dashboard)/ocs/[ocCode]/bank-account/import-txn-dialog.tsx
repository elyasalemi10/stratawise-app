"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { uploadMacquarieTxn } from "@/lib/actions/macquarie-ingest";

// Drag-and-drop upload for a Macquarie TXN file. Parses + dedups + inserts
// rows into bank_transactions, then auto-matches each via the orchestrator
// (deft_drn strategy = strategy #0 since each TXN row carries its DRN).
//
// One file per upload. After the result panel renders, the manager clicks
// Done to close — or Upload another to re-open the dropzone.

interface Props {
  open: boolean;
  onClose: () => void;
  ocId: string;
  bankAccountId: string;
  fundLabel: string;
  onImported: () => void;
}

type Stage = "idle" | "uploading" | "done" | "failed";

export function ImportTxnDialog({ open, onClose, ocId, bankAccountId, fundLabel, onImported }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [filename, setFilename] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; duplicates: number; autoMatched: number; warnings: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  function reset() {
    setStage("idle");
    setFilename(null);
    setResult(null);
    setError(null);
    setIsDragging(false);
    dragDepthRef.current = 0;
  }

  function closeAndReset() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    if (!/\.txn$/i.test(file.name) && !/\.txt$/i.test(file.name) && file.type !== "text/plain") {
      // Macquarie TXN files often have no extension or .txn. Accept anything
      // that looks plausible and let the parser decide.
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("TXN files are usually < 1MB. This one's over 10MB — not a Macquarie TXN.");
      return;
    }

    setFilename(file.name);
    setStage("uploading");
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    const r = await uploadMacquarieTxn(ocId, bankAccountId, fd);
    if (r.error || !r.summary) {
      setStage("failed");
      setError(r.error ?? "Couldn't import this file.");
      return;
    }
    setResult(r.summary);
    setStage("done");
    onImported();
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

  const busy = stage === "uploading";
  const showDropzone = stage === "idle";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeAndReset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Macquarie TXN file — {fundLabel}</DialogTitle>
        </DialogHeader>

        {showDropzone && (
          <div
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className={`rounded-lg border-2 border-dashed transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"
            }`}
          >
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-10">
              <input
                type="file"
                accept=".txn,.txt,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {isDragging ? "Drop the TXN file here" : "Click to browse or drag a TXN file here"}
              </p>
              <p className="text-xs text-muted-foreground text-center max-w-sm">
                Fixed-format file from Macquarie&apos;s Active Banking (Direct Downloads).
                We parse + dedup + auto-match transactions to lots via their DEFT
                Reference Number.
              </p>
            </label>
          </div>
        )}

        {filename && stage !== "idle" && (
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              {busy ? (
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
              ) : stage === "done" ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                </div>
                {busy && <p className="mt-1 text-xs text-muted-foreground">Parsing TXN file…</p>}
                {stage === "done" && result && (
                  <div className="mt-1 space-y-1 text-xs">
                    <p className="text-foreground">
                      <span className="font-medium">{result.imported}</span> transactions imported
                      {result.duplicates > 0 && <>, <span className="font-medium">{result.duplicates}</span> duplicates skipped</>}.
                    </p>
                    {result.imported > 0 && (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">{result.autoMatched}</span>
                        {" "}auto-matched via DEFT Reference Number;
                        {" "}{result.imported - result.autoMatched} await manual review.
                      </p>
                    )}
                    {result.warnings.length > 0 && (
                      <details className="text-muted-foreground">
                        <summary className="cursor-pointer">{result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}</summary>
                        <ul className="mt-1 list-disc pl-4">
                          {result.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                          {result.warnings.length > 10 && <li>… {result.warnings.length - 10} more in logs</li>}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                {stage === "failed" && (
                  <p className="mt-1 text-xs text-amber-700">{error}</p>
                )}
              </div>
              {!busy && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === "done" ? (
            <Button onClick={closeAndReset}>Done</Button>
          ) : (
            <Button variant="ghost" onClick={closeAndReset} disabled={busy}>
              {busy ? "Importing…" : "Cancel"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
