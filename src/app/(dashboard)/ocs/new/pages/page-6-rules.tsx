"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ExternalLink, FileText, Loader2, Pencil, Plus, Upload, X, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VICTORIA_MODEL_RULES } from "@/lib/data/victoria-model-rules";
import {
  getDraftRulesSourceUrl,
  parseDraftRules,
  saveDraftRules,
  saveStep,
  setRulesSource,
  uploadRules,
  type DraftJson,
} from "../actions";

type ParsedRule = {
  oc_scope?: string;
  parent_heading?: string | null;
  rule_number: string;
  heading?: string | null;
  body: string;
  page_number?: number | null;
  rule_type?: "registered" | "standing";
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
  // Two sequential dialogs:
  //   Phase 1 (psMismatch): the document's PS number doesn't match this OC.
  //     "Wrong document?" yes/no. Cancel → discard; Use anyway → phase 2.
  //   Phase 2 (multi-OC scope): the document covers >1 OC; let the manager
  //     pick which scopes apply. Cancel → discard; Apply → done.
  // Phases skip when their condition doesn't apply, so a single-OC document
  // with a matching PS just goes straight to display.
  const [psPhase, setPsPhase] = useState<{
    foundPlan: string | null;
    expectedPlan: string;
  } | null>(null);
  const [scopePhase, setScopePhase] = useState<{
    scopes: Array<{ label: string; plan: string | null; ruleCount: number }>;
    selected: Set<number>;
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
    lastScopesRef.current = parsed.ocScopes ?? [];
    maybeOpenConfirm(parsed.ocScopes ?? [], parsed.rules ?? []);
  }

  // Decide which dialogs (if any) to fire after a successful read-back.
  function maybeOpenConfirm(
    scopes: Array<{ label: string; plan_number: string | null; rule_count: number }>,
    rules: ParsedRule[],
  ) {
    void rules;
    const expectedPlan = (initialDraft.plan_number ?? "").trim().toUpperCase();
    const norm = (s: string | null) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const matchingIdx = expectedPlan
      ? scopes.findIndex((s) => norm(s.plan_number) === expectedPlan)
      : -1;
    const defaultIdx = matchingIdx >= 0 ? matchingIdx : 0;
    const defaultScope = scopes[defaultIdx];
    const psMismatch = !!expectedPlan && !!defaultScope?.plan_number
      && norm(defaultScope.plan_number) !== expectedPlan;

    if (psMismatch) {
      // Open PS-mismatch first; phase 2 fires from its "Use anyway" handler.
      setPsPhase({ foundPlan: defaultScope.plan_number, expectedPlan });
      return;
    }
    if (scopes.length > 1) {
      // No PS issue, but multi-OC — jump straight to the scope picker.
      setScopePhase({
        scopes: scopes.map((s) => ({ label: s.label, plan: s.plan_number, ruleCount: s.rule_count })),
        selected: new Set([defaultIdx]),
      });
    }
  }

  function discardReadBack() {
    setPsPhase(null);
    setScopePhase(null);
    setStage("idle");
    setFilename(null);
    setRuleCount(0);
    setParsedRules([]);
  }

  function onPsMismatchUseAnyway() {
    setPsPhase(null);
    // Open the scope picker only if there's more than one scope. Otherwise
    // the read-back is just applied as-is.
    const scopes = lastScopesRef.current;
    if (scopes.length > 1) {
      const expectedPlan = (initialDraft.plan_number ?? "").trim().toUpperCase();
      const norm = (s: string | null) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
      const matchingIdx = expectedPlan
        ? scopes.findIndex((s) => norm(s.plan_number) === expectedPlan)
        : -1;
      const defaultIdx = matchingIdx >= 0 ? matchingIdx : 0;
      setScopePhase({
        scopes: scopes.map((s) => ({ label: s.label, plan: s.plan_number, ruleCount: s.rule_count })),
        selected: new Set([defaultIdx]),
      });
    }
  }

  function toggleConfirmScope(idx: number) {
    setScopePhase((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { ...prev, selected: next };
    });
  }

  // Cached scopes so the "Use anyway" handler in phase 1 can hand off to
  // phase 2 without re-fetching the parser output.
  const lastScopesRef = useRef<Array<{ label: string; plan_number: string | null; rule_count: number }>>([]);

  // Wizard rules CRUD — manual add, inline edit, inline delete. State only
  // until the manager hits Continue, then persisted via saveDraftRules so a
  // resumed draft reflects the edits. Preview (open the source PDF) is a
  // signed URL we lazy-load on first click.
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<"registered" | "standing">("standing");
  const [addNumber, setAddNumber] = useState("");
  const [addHeading, setAddHeading] = useState("");
  const [addBody, setAddBody] = useState("");

  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [editHeading, setEditHeading] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editType, setEditType] = useState<"registered" | "standing">("registered");

  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Persist the current parsedRules list to the draft. Fire-and-forget; we
  // toast on error but don't block the UI.
  function persistRules(rules: ParsedRule[]) {
    void saveDraftRules(draftId, rules.map((r) => ({
      oc_scope: r.oc_scope,
      parent_heading: r.parent_heading ?? null,
      rule_number: r.rule_number,
      heading: r.heading ?? null,
      body: r.body,
      page_number: r.page_number ?? null,
      rule_type: r.rule_type,
    }))).then((r) => {
      if (r.error) toast.error("Couldn't save rule changes.");
    });
  }

  function openAdd(type: "registered" | "standing") {
    setAddType(type);
    // Suggest next sequential top-level number.
    const tops = parsedRules
      .map((r) => r.rule_number.split(".")[0])
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const next = (tops.length > 0 ? Math.max(...tops) : 0) + 1;
    setAddNumber(String(next));
    setAddHeading("");
    setAddBody("");
    setAddOpen(true);
  }

  function commitAdd() {
    if (!addNumber.trim() || !addBody.trim()) {
      toast.error("Rule number and body are both required.");
      return;
    }
    const next: ParsedRule = {
      rule_number: addNumber.trim(),
      heading: addHeading.trim() || null,
      body: addBody.trim(),
      rule_type: addType,
    };
    const merged = [...parsedRules, next];
    setParsedRules(merged);
    setRuleCount(merged.length);
    persistRules(merged);
    setAddOpen(false);
  }

  function openEdit(idx: number) {
    const r = parsedRules[idx];
    if (!r) return;
    setEditIdx(idx);
    setEditNumber(r.rule_number);
    setEditHeading(r.heading ?? "");
    setEditBody(r.body);
    setEditType(r.rule_type ?? "registered");
  }

  function commitEdit() {
    if (editIdx == null) return;
    if (!editNumber.trim() || !editBody.trim()) {
      toast.error("Rule number and body are both required.");
      return;
    }
    const merged = parsedRules.map((r, i) =>
      i === editIdx
        ? { ...r, rule_number: editNumber.trim(), heading: editHeading.trim() || null, body: editBody.trim(), rule_type: editType }
        : r,
    );
    setParsedRules(merged);
    persistRules(merged);
    setEditIdx(null);
  }

  function commitDelete() {
    if (deleteIdx == null) return;
    const merged = parsedRules.filter((_, i) => i !== deleteIdx);
    setParsedRules(merged);
    setRuleCount(merged.length);
    persistRules(merged);
    setDeleteIdx(null);
  }

  async function openPreview() {
    if (pdfUrl) {
      window.open(pdfUrl, "_blank", "noopener");
      return;
    }
    setPdfLoading(true);
    const r = await getDraftRulesSourceUrl(draftId);
    setPdfLoading(false);
    if (!r.url) {
      toast.error(r.error ?? "No PDF attached to this rule.");
      return;
    }
    setPdfUrl(r.url);
    window.open(r.url, "_blank", "noopener");
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
                    Reading your document and pulling out every rule. This can take{" "}
                    <strong>1–3 minutes</strong> on long documents. Please don&apos;t leave this page
                    until it&apos;s finished.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Rules list block — visible whenever there's anything to show OR
              the manager has chosen "custom" rules (so they can start typing
              by hand). Header carries the Add button + PDF preview + clear. */}
          {(parsedRules.length > 0 || (source === "custom" && stage !== "uploading" && stage !== "parsing")) ? (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {filename ?? "Your rules"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    — {parsedRules.length} rule{parsedRules.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {filename && (
                    <button
                      type="button"
                      onClick={() => void openPreview()}
                      disabled={pdfLoading}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer disabled:opacity-50"
                    >
                      {pdfLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                      Open PDF
                    </button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button type="button" size="sm" variant="secondary">
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add rule
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openAdd("registered")}>
                        <Scale className="mr-2 h-3.5 w-3.5 text-emerald-700" />
                        Registered rule
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAdd("standing")}>
                        <FileText className="mr-2 h-3.5 w-3.5 text-amber-700" />
                        Standing rule
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {filename && (
                    <button
                      type="button"
                      onClick={() => {
                        setStage("idle");
                        setFilename(null);
                        setParseError(null);
                        setRuleCount(0);
                        setParsedRules([]);
                        persistRules([]);
                      }}
                      className="ml-1 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      aria-label="Remove all rules"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[480px] overflow-y-auto">{parsedRules.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No rules yet — use <strong>Add rule</strong> above to add one, or upload a PDF below.
                </p>
              ) : (() => {
                // Group rules by oc_scope first (most docs have one scope, but
                // mixed-use plans register rules for separate OCs in the same
                // PDF), then by parent_heading within each scope so the user
                // can see "8. Commercial Lots → 8.2.1 Advertising Signage" in
                // context rather than as an orphan rule.
                const indexed = parsedRules.map((r, idx) => ({ rule: r, idx }));
                const byScope = new Map<string, typeof indexed>();
                for (const entry of indexed) {
                  const k = entry.rule.oc_scope ?? "";
                  if (!byScope.has(k)) byScope.set(k, []);
                  byScope.get(k)!.push(entry);
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
                      {scopeRules.map(({ rule: r, idx }) => (
                        <li key={idx} className="group flex items-start gap-2 px-4 py-3 hover:bg-muted/20">
                          <div className="flex-1 min-w-0">
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
                          </div>
                          {/* Hover-only edit + delete. stopPropagation isn't
                              required here since the row isn't clickable. */}
                          <div className="hidden items-center gap-1 shrink-0 group-hover:flex">
                            <button
                              type="button"
                              onClick={() => openEdit(idx)}
                              aria-label="Edit rule"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteIdx(idx)}
                              aria-label="Delete rule"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ));
              })()}</div>
            </div>
          ) : null}

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

      {/* Phase 1 — PS-number mismatch. Fires first when relevant; cancel
          discards the read-back, "Use anyway" hands off to phase 2 (or
          straight to display if the document is single-OC). */}
      <Dialog open={psPhase != null} onOpenChange={(open) => { if (!open) discardReadBack(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Plan-of-Subdivision number doesn&apos;t match</DialogTitle>
            <DialogDescription>
              The document looks like it&apos;s for{" "}
              <span className="font-medium text-foreground">{psPhase?.foundPlan ?? "another plan"}</span>
              , but you&apos;re setting up{" "}
              <span className="font-medium text-foreground">{psPhase?.expectedPlan}</span>.
              {" "}Use it anyway?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={discardReadBack}>
              Cancel — wrong document
            </Button>
            <Button onClick={onPsMismatchUseAnyway}>Use anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 2 — multi-OC scope picker. Fires when there's more than one
          OC scope in the document. Multi-pick because a child OC sometimes
          adopts the parent body corporate's rules verbatim. */}
      <Dialog open={scopePhase != null} onOpenChange={(open) => { if (!open) discardReadBack(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pick which OCs&apos; rules to apply</DialogTitle>
            <DialogDescription>
              The document covers more than one OC. Tick the ones you want
              to apply to <span className="font-medium text-foreground">this</span> OC — usually
              just one, but you can keep multiple if a child OC adopts a parent OC&apos;s rules.
            </DialogDescription>
          </DialogHeader>
          {scopePhase && (
            <div className="space-y-1.5">
              {scopePhase.scopes.map((s, idx) => {
                const checked = scopePhase.selected.has(idx);
                return (
                  <button
                    key={s.label + idx}
                    type="button"
                    onClick={() => toggleConfirmScope(idx)}
                    className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm cursor-pointer ${
                      checked ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {s.label}{s.plan ? ` (${s.plan})` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.ruleCount} rule{s.ruleCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={discardReadBack}>
              Cancel — wrong document
            </Button>
            <Button
              onClick={() => {
                if (!scopePhase) return;
                if (scopePhase.selected.size === 0) {
                  toast.error("Pick at least one OC's rules to apply.");
                  return;
                }
                const chosenLabels = new Set(
                  Array.from(scopePhase.selected).map((i) => scopePhase.scopes[i]?.label),
                );
                setParsedRules((prev) => prev.filter((r) => chosenLabels.has(r.oc_scope ?? "")));
                setScopePhase(null);
              }}
            >
              Apply selection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add rule (wizard) — same shape as the live rules page, scoped to
          this draft. Saves to draft.rules_parsed_json via saveDraftRules
          so refreshes don't lose the manual addition. */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add {addType === "standing" ? "standing" : "registered"} rule</DialogTitle>
            <DialogDescription>
              {addType === "standing"
                ? "Committee-adopted internal rules that aren't filed with Land Use Victoria."
                : "Filed with Land Use Victoria. Use this for any rule that's part of the OC's registered set."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wr-num">
                Rule number <span className="text-destructive">*</span>
              </Label>
              <Input id="wr-num" value={addNumber} onChange={(e) => setAddNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wr-head">Heading</Label>
              <Input id="wr-head" value={addHeading} onChange={(e) => setAddHeading(e.target.value)} placeholder="Short title for the rule" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wr-body">
                Body <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="wr-body"
                rows={5}
                value={addBody}
                onChange={(e) => setAddBody(e.target.value)}
                placeholder="Full text of the rule"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={commitAdd}>Add rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit rule (wizard) */}
      <Dialog open={editIdx != null} onOpenChange={(open) => { if (!open) setEditIdx(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="we-type">Type</Label>
                <Select value={editType} onValueChange={(v) => setEditType((v as "registered" | "standing") ?? "registered")}>
                  <SelectTrigger id="we-type">
                    <SelectValue>{editType === "standing" ? "Standing" : "Registered"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="standing">Standing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="we-num">
                  Rule number <span className="text-destructive">*</span>
                </Label>
                <Input id="we-num" value={editNumber} onChange={(e) => setEditNumber(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="we-head">Heading</Label>
              <Input id="we-head" value={editHeading} onChange={(e) => setEditHeading(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="we-body">
                Body <span className="text-destructive">*</span>
              </Label>
              <Textarea id="we-body" rows={5} value={editBody} onChange={(e) => setEditBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditIdx(null)}>Cancel</Button>
            <Button onClick={commitEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm (wizard) */}
      <Dialog open={deleteIdx != null} onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this rule?</DialogTitle>
            <DialogDescription>
              {deleteIdx != null && parsedRules[deleteIdx] && (
                <>
                  Rule <strong className="text-foreground">{parsedRules[deleteIdx].rule_number}</strong>
                  {parsedRules[deleteIdx].heading ? ` — ${parsedRules[deleteIdx].heading}` : ""} will be removed.
                  The PDF stays in the OC&apos;s documents.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteIdx(null)}>Cancel</Button>
            <Button onClick={commitDelete} className="bg-destructive hover:bg-destructive/90">
              Remove rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
