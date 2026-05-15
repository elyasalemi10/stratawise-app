"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadPlan, parseDraftWithGemini, selectDetectedOc, skipParsing } from "../actions";

// Wizard entry popup. Opens on mount; closes once the user either:
//   (a) uploads a plan PDF and (when multiple OCs are detected) picks one, or
//   (b) clicks "Continue manually" to skip parsing entirely.
//
// Either path advances the wizard to Step 1 with the appropriate seed data.
// No dropzone — explicit upload button per the spec.

interface DetectedOcLite {
  oc_number: number;
  lot_count: number;
  oc_name?: string | null;
}

type Phase = "idle" | "uploading" | "parsing" | "complete" | "failed";

export function EntryPopup({
  draftId,
  initialStatus,
  initialFilename,
  initialDetectedOcs,
  onDone,
}: {
  draftId: string;
  initialStatus: "none" | "pending" | "complete" | "failed" | "skipped";
  initialFilename: string | null;
  initialDetectedOcs: DetectedOcLite[];
  /** Called once the popup is ready to close — either after a successful
   *  upload+chooser confirm, or after a "Continue manually" click. */
  onDone: () => void;
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
  const [showChooser, setShowChooser] = useState(false);
  const [chooserChoice, setChooserChoice] = useState<number>(0);
  const [chooserPending, setChooserPending] = useState(false);
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

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function onContinue() {
    if (detectedOcs.length > 1) {
      setChooserChoice(0);
      setShowChooser(true);
      return;
    }
    setContinuePending(true);
    onDone();
  }

  async function confirmChooserChoice() {
    setChooserPending(true);
    const r = await selectDetectedOc(draftId, chooserChoice);
    if (r.error) {
      setChooserPending(false);
      toast.error(r.error);
      return;
    }
    setShowChooser(false);
    setChooserPending(false);
    onDone();
  }

  async function onContinueManually() {
    setSkipping(true);
    const r = await skipParsing(draftId);
    if (r.error) {
      toast.error(r.error);
      setSkipping(false);
      return;
    }
    onDone();
  }

  const busy = phase === "uploading" || phase === "parsing";

  return (
    <>
      {/* The popup itself. We DON'T pass onOpenChange so backdrop / Esc can't
          flip the controlled `open` back to false — the user must click
          Continue (with PDF) or Continue manually to advance. */}
      <Dialog open={!showChooser}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Upload your plan of subdivision</DialogTitle>
            <DialogDescription>
              We&apos;ll read your document and pre-fill the OC details, lot schedule, and entitlements. You can skip this and enter everything manually.
            </DialogDescription>
          </DialogHeader>

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

          {/* Single status panel — flips between idle / uploading / parsing /
              complete / failed. No dropzone; the upload button is the only
              way to surface the file picker. */}
          {phase === "idle" && !filename && (
            <div className="flex flex-col items-center gap-3 rounded-md border border-border bg-card px-4 py-8">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <Button type="button" onClick={pickFile}>
                Choose PDF
              </Button>
              <p className="text-xs text-muted-foreground">Up to 50 MB</p>
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

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onContinueManually}
              disabled={busy || skipping || continuePending}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {skipping && <Loader2 className="size-3.5 animate-spin" />}
              Continue manually
            </button>
            <Button
              type="button"
              onClick={onContinue}
              disabled={(phase !== "complete" && phase !== "failed") || continuePending}
            >
              {continuePending && <Loader2 className="size-4 animate-spin" />}
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Multi-OC chooser dialog (inline with the popup). Opens only when
          the plan defines more than one OC and the user clicks Continue. */}
      <Dialog open={showChooser} onOpenChange={(o) => { if (!chooserPending && !o) setShowChooser(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This plan defines {detectedOcs.length} owners corporations</DialogTitle>
            <DialogDescription>
              Pick the OC you&apos;re setting up first. We&apos;ll seed the wizard with its address and lot schedule. You can create the others later from the same plan.
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
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowChooser(false)} disabled={chooserPending}>Back</Button>
            <Button onClick={confirmChooserChoice} disabled={chooserPending}>
              {chooserPending && <Loader2 className="size-4 animate-spin" />}
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
