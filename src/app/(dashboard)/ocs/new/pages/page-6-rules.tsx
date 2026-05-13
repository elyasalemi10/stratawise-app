"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Upload, X, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadRules, parseDraftRules, setRulesSource, saveStep, type DraftJson } from "../actions";

// Wizard page 6 — OC Rules.
//
// Two paths:
//   1. Adopt Victoria's Model Rules (default; one click, no upload).
//   2. Upload custom registered rules → Gemini parses into structured rules
//      → on Create OC we materialise oc_rules rows + register the PDF in
//      documents.
//
// The choice toggle lives in the wizard state (rules_source). Custom path
// shows an inline upload + parse status panel. Skip = "no rules yet" = model.

type ParseStage = "idle" | "uploading" | "parsing" | "complete" | "failed";

export function Page6Rules({
  draftId,
  initialDraft,
  initialRulesFilename,
  initialParseStatus,
  initialRuleCount,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  initialRulesFilename: string | null;
  initialParseStatus: "none" | "uploaded" | "parsed" | "failed";
  initialRuleCount: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const [source, setSource] = useState<"model" | "custom">(initialDraft.rules_source ?? "model");
  const [stage, setStage] = useState<ParseStage>(
    initialParseStatus === "parsed" ? "complete"
    : initialParseStatus === "failed" ? "failed"
    : "idle",
  );
  const [filename, setFilename] = useState<string | null>(initialRulesFilename);
  const [ruleCount, setRuleCount] = useState(initialRuleCount);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const dragDepthRef = useRef(0);

  async function handleFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Rules PDF exceeds 25MB.");
      return;
    }
    setFilename(file.name);
    setStage("uploading");
    setParseError(null);

    const fd = new FormData();
    fd.append("file", file);
    const up = await uploadRules(draftId, fd);
    if (up.error) {
      setStage("failed");
      setParseError(up.error);
      toast.error(up.error);
      return;
    }
    setStage("parsing");
    const parsed = await parseDraftRules(draftId);
    if (parsed.error) {
      setStage("failed");
      setParseError(parsed.error);
      return;
    }
    setStage("complete");
    setRuleCount(parsed.ruleCount ?? 0);
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

  async function pickSource(next: "model" | "custom") {
    setSource(next);
    await setRulesSource(draftId, next);
  }

  async function onContinue() {
    setPending(true);
    // If the user picked custom but didn't upload anything, soft-warn (we
    // don't block — they can do this later from the OC's manage page).
    if (source === "custom" && !filename) {
      const ok = window.confirm("You haven't uploaded a rules PDF. Continue with no custom rules (the OC will fall back to Model Rules)?");
      if (!ok) {
        setPending(false);
        return;
      }
    }
    const r = await saveStep(draftId, {
      rules_source: source,
      rules_status: stage === "complete" ? "parsed" : (filename ? "uploaded" : "none"),
      rules_filename: filename ?? undefined,
      rules_rule_count: ruleCount,
    }, 7);
    setPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    onNext();
  }

  const busy = stage === "uploading" || stage === "parsing";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Add your owners corporation rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your registered rules, or skip to use Victoria&apos;s Model Rules as the default.
        </p>
      </div>

      {/* Two-tile chooser */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => void pickSource("model")}
          className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
            source === "model" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Use Victoria&apos;s Model Rules</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            The default set under the Owners Corporations Regulations. No upload needed.
          </p>
        </button>
        <button
          type="button"
          onClick={() => void pickSource("custom")}
          className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
            source === "custom" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Upload registered rules</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We&apos;ll parse each rule&apos;s number, heading, and text so we can link directly to it
            from breach notices, search, and chat.
          </p>
        </button>
      </div>

      {source === "custom" && (
        <>
          {/* Dropzone — hidden once a file is uploaded; reappears when cleared. */}
          {!filename && (
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
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
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

          {filename && stage !== "idle" && (
            <div className="relative rounded-md border border-border bg-card p-6">
              <div className="flex flex-col items-center text-center gap-3">
                {busy ? (
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                ) : stage === "complete" ? (
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                )}
                <div className="flex items-center justify-center gap-2 max-w-full">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                </div>
                {stage === "uploading" && (
                  <p className="text-xs text-muted-foreground">Uploading…</p>
                )}
                {stage === "parsing" && (
                  <p className="text-xs text-muted-foreground">
                    Extracting rules… usually 10–30 seconds.
                  </p>
                )}
                {stage === "complete" && (
                  <p className="text-xs text-foreground">
                    Parsed {ruleCount} rule{ruleCount === 1 ? "" : "s"}.
                  </p>
                )}
                {stage === "failed" && parseError && (
                  <p className="text-xs text-amber-700 max-w-md">{parseError}</p>
                )}
                {!busy && (
                  <button
                    type="button"
                    onClick={() => { setStage("idle"); setFilename(null); setParseError(null); setRuleCount(0); }}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label="Clear upload"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending || busy}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
