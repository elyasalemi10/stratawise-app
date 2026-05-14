"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileText, Loader2, Upload, X, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VICTORIA_MODEL_RULES } from "@/lib/data/victoria-model-rules";
import { uploadRules, parseDraftRules, setRulesSource, saveStep, type DraftJson } from "../actions";

type ParsedRule = {
  oc_scope?: string;
  parent_heading?: string | null;
  rule_number: string;
  heading?: string | null;
  body: string;
};

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
  initialParsedRules,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  initialRulesFilename: string | null;
  initialParseStatus: "none" | "uploaded" | "parsed" | "failed";
  initialRuleCount: number;
  initialParsedRules: ParsedRule[];
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
  const [parsedRules, setParsedRules] = useState<ParsedRule[]>(initialParsedRules);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const dragDepthRef = useRef(0);
  const resumedParseRef = useRef(false);
  // Combined post-parse confirmation dialog. Fires when the parsed rules
  // either cover multiple OCs (drop the ones we're not setting up) or the
  // PS number on the document doesn't match this OC. Both checks are folded
  // into a single dialog so the manager doesn't see two stacked popups.
  const [confirm, setConfirm] = useState<{
    keepLabel: string | null;
    keepPlan: string | null;
    dropScopes: Array<{ label: string; plan: string | null; ruleCount: number }>;
    psMismatch: boolean;
    expectedPlan: string;
  } | null>(null);

  // Resume case: the user uploaded a rules PDF, then navigated away before
  // parsing completed (or it failed silently). On remount we have a filename
  // but no parsed rules — kick off parsing again so the upload module isn't
  // just gone with no upload box and no status indicator either.
  useEffect(() => {
    if (resumedParseRef.current) return;
    if (initialParseStatus !== "uploaded" || !initialRulesFilename) return;
    resumedParseRef.current = true;
    // Move state updates outside the synchronous effect body — the lint rule
    // forbids cascading setState. Defer to a microtask so the parse fires
    // immediately but the initial render isn't disturbed.
    void (async () => {
      setStage("parsing");
      const parsed = await parseDraftRules(draftId);
      if (parsed.error) {
        setStage("failed");
        setParseError(parsed.error);
        return;
      }
      setStage("complete");
      setRuleCount(parsed.ruleCount ?? 0);
      if (parsed.rules) setParsedRules(parsed.rules);
    })();
  }, [draftId, initialParseStatus, initialRulesFilename]);

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
    if (parsed.rules) setParsedRules(parsed.rules);
    maybeOpenConfirm(parsed.ocScopes ?? [], parsed.rules ?? []);
  }

  // Inspect the parser output for multi-OC scopes or a PS-number mismatch
  // and open the confirmation dialog if either condition is hit. Both are
  // folded into one dialog rather than chained popups.
  function maybeOpenConfirm(
    scopes: Array<{ label: string; plan_number: string | null; rule_count: number }>,
    rules: ParsedRule[],
  ) {
    void rules;
    const expectedPlan = (initialDraft.plan_number ?? "").trim().toUpperCase();
    const norm = (s: string | null) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const matchingScope = expectedPlan
      ? scopes.find((s) => norm(s.plan_number) === expectedPlan)
      : null;
    const keep = matchingScope ?? scopes[0] ?? null;
    const dropList = scopes.filter((s) => s !== keep);
    const psMismatch = !!expectedPlan && !!keep?.plan_number && norm(keep.plan_number) !== expectedPlan;
    // Open the dialog only if there's something to confirm: more than one
    // scope OR a PS number mismatch on the single scope.
    if (scopes.length <= 1 && !psMismatch) return;
    setConfirm({
      keepLabel: keep?.label ?? null,
      keepPlan: keep?.plan_number ?? null,
      dropScopes: dropList.map((s) => ({ label: s.label, plan: s.plan_number, ruleCount: s.rule_count })),
      psMismatch,
      expectedPlan,
    });
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
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
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

      {source === "model" && (
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 border-b border-border text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Victoria&apos;s Model Rules
          </div>
          <ol className="divide-y divide-border">
            {VICTORIA_MODEL_RULES.map((r) => (
              <li key={r.rule_number} className="px-4 py-3">
                <p className="text-sm font-semibold text-foreground">
                  {r.rule_number}. {r.heading}
                </p>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {r.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

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
                isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
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

          {filename && busy && (
            <div className="relative rounded-md border border-border bg-card p-6">
              <div className="flex flex-col items-center text-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="flex items-center justify-center gap-2 max-w-full">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                </div>
                {stage === "uploading" && (
                  <p className="text-xs text-muted-foreground">Uploading…</p>
                )}
                {stage === "parsing" && (
                  <p className="text-xs text-muted-foreground max-w-md">
                    Extracting rules… this can take <strong>1–3 minutes</strong> on long
                    rules documents. Please don&apos;t leave this page until parsing finishes.
                  </p>
                )}
              </div>
            </div>
          )}

          {filename && stage === "complete" && parsedRules.length > 0 && (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{filename}</span>
                  <span className="text-xs text-muted-foreground shrink-0">— {ruleCount} rule{ruleCount === 1 ? "" : "s"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage("idle");
                    setFilename(null);
                    setParseError(null);
                    setRuleCount(0);
                    setParsedRules([]);
                  }}
                  className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                  aria-label="Remove upload"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[480px] overflow-y-auto">{(() => {
                // Group rules by oc_scope first (most docs have one scope, but
                // mixed-use plans register rules for separate OCs in the same
                // PDF), then by parent_heading within each scope so the user
                // can see "8. Commercial Lots → 8.2.1 Advertising Signage" in
                // context rather than as an orphan rule.
                const byScope = new Map<string, ParsedRule[]>();
                for (const r of parsedRules) {
                  const k = r.oc_scope ?? "";
                  if (!byScope.has(k)) byScope.set(k, []);
                  byScope.get(k)!.push(r);
                }
                const scopeEntries = Array.from(byScope.entries());
                return scopeEntries.map(([scope, scopeRules], si) => (
                  <div key={si}>
                    {scope && scopeEntries.length > 1 && (
                      <div className="bg-primary/5 px-4 py-2 border-b border-border text-xs font-semibold uppercase tracking-wide text-primary">
                        {scope}
                      </div>
                    )}
                    <ol className="divide-y divide-border">
                      {scopeRules.map((r, i) => (
                        <li key={i} className="px-4 py-3">
                          {r.parent_heading && (
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              {r.parent_heading}
                            </p>
                          )}
                          <p className="text-sm font-semibold text-foreground">
                            {r.rule_number}{r.heading ? `. ${r.heading}` : ""}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                            {r.body}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ));
              })()}</div>
            </div>
          )}

          {filename && stage === "failed" && (
            <div className="relative rounded-md border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium text-foreground truncate">{filename}</p>
                  </div>
                  {parseError && <p className="mt-1 text-xs text-amber-900">{parseError}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage("idle");
                    setFilename(null);
                    setParseError(null);
                    setRuleCount(0);
                    setParsedRules([]);
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                  aria-label="Clear upload"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending || busy}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>

      {/* Combined confirm — fires when the parsed rules cover more than one
          OC and/or the document's PS number doesn't match this OC. One
          dialog covers both cases so the manager doesn't see two stacked
          popups. */}
      <Dialog open={confirm != null} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm?.dropScopes.length ? "We detected rules for more than one OC" : "Plan-of-Subdivision number doesn't match"}
            </DialogTitle>
            <DialogDescription>
              {confirm?.psMismatch && (
                <>
                  The document looks like it&apos;s for{" "}
                  <span className="font-medium text-foreground">{confirm?.keepPlan ?? "another plan"}</span>
                  , but you&apos;re setting up{" "}
                  <span className="font-medium text-foreground">{confirm?.expectedPlan}</span>.{" "}
                </>
              )}
              {!!confirm?.dropScopes.length && (
                <>
                  We&apos;ll keep <span className="font-medium text-foreground">{confirm?.keepLabel ?? "the first OC's rules"}</span>
                  {" "}and drop the others. You can re-upload from those OCs&apos; rules pages later.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {confirm?.dropScopes && confirm.dropScopes.length > 0 && (
            <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2 text-xs">
              <p className="font-medium text-foreground">Dropping:</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {confirm.dropScopes.map((s) => (
                  <li key={s.label}>
                    {s.label}{s.plan ? ` (${s.plan})` : ""} — {s.ruleCount} rule{s.ruleCount === 1 ? "" : "s"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => {
              // Cancel = discard the parse so the user can re-upload the
              // correct document. We don't actually delete the R2 object
              // (the manage doc tab can show it as orphan) but we clear
              // the wizard's parsed view.
              setConfirm(null);
              setStage("idle");
              setFilename(null);
              setRuleCount(0);
              setParsedRules([]);
            }}>
              Cancel — wrong document
            </Button>
            <Button onClick={() => setConfirm(null)}>Use anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
