"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, FileText, Loader2, Pencil, Plus, Upload, X, Scale, Trash2 } from "lucide-react";
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
  chapter_number?: string | null;
  chapter_heading?: string | null;
  section_number?: string | null;
  section_heading?: string | null;
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

  // Persist the current parsedRules list to the draft. Fire-and-forget; we
  // toast on error but don't block the UI.
  function persistRules(rules: ParsedRule[]) {
    void saveDraftRules(draftId, rules.map((r) => ({
      oc_scope: r.oc_scope,
      parent_heading: r.parent_heading ?? null,
      chapter_number: r.chapter_number ?? null,
      chapter_heading: r.chapter_heading ?? null,
      section_number: r.section_number ?? null,
      section_heading: r.section_heading ?? null,
      rule_number: r.rule_number,
      heading: r.heading ?? null,
      body: r.body,
      page_number: r.page_number ?? null,
      rule_type: r.rule_type,
    }))).then((r) => {
      if (r.error) toast.error("Couldn't save rule changes.");
    });
  }

  // Distinct chapters and sections derived from the existing rule list, so
  // the Add dialog can offer chapter and section as two separate selects.
  // Chapters are unique by chapter_number; sections live inside a chapter
  // and are unique by chapter_number + section_number.
  function listChapters(rules: ParsedRule[]): Array<{ key: string; number: string; heading: string; label: string }> {
    const seen = new Map<string, { key: string; number: string; heading: string; label: string }>();
    for (const r of rules) {
      const chNum = r.chapter_number?.trim();
      if (!chNum) continue;
      if (seen.has(chNum)) continue;
      const chHead = (r.chapter_heading ?? "").trim();
      seen.set(chNum, { key: chNum, number: chNum, heading: chHead, label: `${chNum}. ${chHead}`.trim() });
    }
    return Array.from(seen.values());
  }
  function listSectionsInChapter(rules: ParsedRule[], chapterNumber: string): Array<{ key: string; number: string; heading: string; label: string }> {
    const seen = new Map<string, { key: string; number: string; heading: string; label: string }>();
    for (const r of rules) {
      if ((r.chapter_number ?? "").trim() !== chapterNumber) continue;
      const secNum = r.section_number?.trim();
      if (!secNum) continue;
      if (seen.has(secNum)) continue;
      const secHead = (r.section_heading ?? "").trim();
      seen.set(secNum, { key: secNum, number: secNum, heading: secHead, label: `${secNum}. ${secHead}`.trim() });
    }
    return Array.from(seen.values());
  }

  // Add dialog state — Type / Chapter / Section all picked here so adding
  // a rule doesn't require pre-selecting Type from a dropdown menu.
  // Chapter / section can be:
  //   ""        → none (top-level rule with no chapter)
  //   "__new__" → inline number+heading inputs surface
  //   string    → key matches an existing chapter/section
  const [addChapterKey, setAddChapterKey] = useState<string>("");
  const [addNewChapterNum, setAddNewChapterNum] = useState("");
  const [addNewChapterHead, setAddNewChapterHead] = useState("");
  const [addSectionKey, setAddSectionKey] = useState<string>("");
  const [addNewSectionNum, setAddNewSectionNum] = useState("");
  const [addNewSectionHead, setAddNewSectionHead] = useState("");

  function openAdd(type: "registered" | "standing") {
    setAddType(type);
    setAddChapterKey("");
    setAddSectionKey("");
    setAddNewChapterNum("");
    setAddNewChapterHead("");
    setAddNewSectionNum("");
    setAddNewSectionHead("");
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
    // Resolve chapter + section context.
    let chapter_number: string | null = null;
    let chapter_heading: string | null = null;
    let section_number: string | null = null;
    let section_heading: string | null = null;
    if (addChapterKey === "__new__") {
      chapter_number = addNewChapterNum.trim() || null;
      chapter_heading = addNewChapterHead.trim() || null;
    } else if (addChapterKey) {
      const found = listChapters(parsedRules).find((c) => c.key === addChapterKey);
      if (found) {
        chapter_number = found.number;
        chapter_heading = found.heading || null;
      }
    }
    if (chapter_number) {
      if (addSectionKey === "__new__") {
        section_number = addNewSectionNum.trim() || null;
        section_heading = addNewSectionHead.trim() || null;
      } else if (addSectionKey) {
        const found = listSectionsInChapter(parsedRules, chapter_number).find((s) => s.key === addSectionKey);
        if (found) {
          section_number = found.number;
          section_heading = found.heading || null;
        }
      }
    }
    const parent_heading = chapter_number
      ? section_number
        ? `${chapter_number}. ${chapter_heading ?? ""} — ${section_number} ${section_heading ?? ""}`.trim()
        : `${chapter_number}. ${chapter_heading ?? ""}`.trim()
      : null;
    const next: ParsedRule = {
      rule_number: addNumber.trim(),
      heading: addHeading.trim() || null,
      body: addBody.trim(),
      rule_type: addType,
      chapter_number,
      chapter_heading,
      section_number,
      section_heading,
      parent_heading,
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
          Upload your registered rules, or use the Victoria&apos;s Model Rules.
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
          {/* Add Rule bar — lives above the dropzone so the manager can
              add rules by hand even before uploading a PDF. The rules list
              box (below) only appears once at least one rule exists; that
              keeps an empty "Your rules" panel from cluttering the page
              before there's anything to show. */}
          <div className="flex items-center justify-end">
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
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem
                  onClick={() => openAdd("registered")}
                  className="whitespace-nowrap [&_svg]:!text-emerald-700"
                >
                  <Scale className="mr-2 h-3.5 w-3.5 text-emerald-700" />
                  Registered rule
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openAdd("standing")}
                  className="whitespace-nowrap [&_svg]:!text-amber-700"
                >
                  <FileText className="mr-2 h-3.5 w-3.5 text-amber-700" />
                  Standing rule
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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

          {/* Rules list block — only appears once at least one rule exists.
              Before that the dropzone + Add Rule bar above are the whole
              surface; once parsedRules is non-empty we surface the list
              alongside its filename/count/clear header. */}
          {parsedRules.length > 0 ? (
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
                      onClick={() => {
                        setStage("idle");
                        setFilename(null);
                        setParseError(null);
                        setRuleCount(0);
                        setParsedRules([]);
                        persistRules([]);
                      }}
                      className="text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      aria-label="Remove all rules"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[480px] overflow-y-auto">{(() => {
                // Hierarchical render: oc_scope → chapter → section → rules.
                // The chapter band carries the chapter number+heading; the
                // section sub-band carries the section heading. Rules sit
                // beneath their section, indented slightly so the visual
                // weight matches the source document.
                type Entry = { rule: ParsedRule; idx: number };
                const indexed: Entry[] = parsedRules.map((r, idx) => ({ rule: r, idx }));
                const byScope = new Map<string, Entry[]>();
                for (const e of indexed) {
                  const k = e.rule.oc_scope ?? "";
                  if (!byScope.has(k)) byScope.set(k, []);
                  byScope.get(k)!.push(e);
                }
                const scopeEntries = Array.from(byScope.entries());
                return scopeEntries.map(([scope, scopeRules], si) => {
                  // Within a scope, group by chapter then by section, in
                  // first-seen order.
                  const byChapter = new Map<string, { number: string | null; heading: string | null; sections: Map<string, { number: string | null; heading: string | null; rules: Entry[] }> }>();
                  for (const e of scopeRules) {
                    const chNum = e.rule.chapter_number?.trim() || "";
                    const chKey = chNum || "__nochapter__";
                    if (!byChapter.has(chKey)) {
                      byChapter.set(chKey, {
                        number: chNum || null,
                        heading: e.rule.chapter_heading ?? null,
                        sections: new Map(),
                      });
                    }
                    const chapter = byChapter.get(chKey)!;
                    const secNum = e.rule.section_number?.trim() || "";
                    const secKey = secNum || "__nosection__";
                    if (!chapter.sections.has(secKey)) {
                      chapter.sections.set(secKey, {
                        number: secNum || null,
                        heading: e.rule.section_heading ?? null,
                        rules: [],
                      });
                    }
                    chapter.sections.get(secKey)!.rules.push(e);
                  }
                  return (
                    <div key={si}>
                      {scope && scopeEntries.length > 1 && (
                        <div className="bg-primary/5 px-4 py-2 border-b border-border text-xs font-semibold uppercase tracking-wide text-primary">
                          {scope}
                        </div>
                      )}
                      {Array.from(byChapter.entries()).map(([chKey, chapter]) => (
                        <div key={chKey}>
                          {chapter.number && (
                            <div className="bg-muted/60 px-4 py-2 border-b border-border">
                              <p className="text-sm font-semibold text-foreground">
                                {chapter.number}. {chapter.heading ?? ""}
                              </p>
                            </div>
                          )}
                          {Array.from(chapter.sections.entries()).map(([secKey, section]) => (
                            <div key={secKey}>
                              {section.number && (
                                <div className="px-4 py-1.5 border-b border-border bg-muted/20">
                                  <p className="text-xs font-semibold italic text-muted-foreground">
                                    {section.number}. {section.heading ?? ""}
                                  </p>
                                </div>
                              )}
                              <ol className="divide-y divide-border">
                                {section.rules.map(({ rule: r, idx }) => (
                                  <li key={idx} className="group flex items-start gap-2 px-4 py-3 pl-8 hover:bg-muted/20">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold text-foreground">
                                        {r.rule_number}{r.heading ? `. ${r.heading}` : ""}
                                      </p>
                                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                        {r.body}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
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
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                });
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
            <Button variant="secondary" onClick={discardReadBack}>
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
            <Button variant="secondary" onClick={discardReadBack}>
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
            <DialogTitle>Add rule</DialogTitle>
            <DialogDescription>
              Registered rules are filed with Land Use Victoria; standing rules are committee-adopted internal rules that aren&apos;t filed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Type + Chapter on one row, Section + (optional inline new
                fields) on the next. Section is disabled until a chapter is
                chosen — sections only make sense inside a chapter. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wr-type">Type</Label>
                <Select value={addType} onValueChange={(v) => setAddType(((v ?? "registered") as "registered" | "standing"))}>
                  <SelectTrigger id="wr-type">
                    <SelectValue>{addType === "standing" ? "Standing rule" : "Registered rule"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Registered rule</SelectItem>
                    <SelectItem value="standing">Standing rule</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wr-chapter">Chapter</Label>
                <Select
                  value={addChapterKey || "__top__"}
                  onValueChange={(v) => {
                    const next = !v || v === "__top__" ? "" : v;
                    setAddChapterKey(next);
                    // Resetting the chapter also clears section state — a
                    // section selection only makes sense under a chosen
                    // chapter, so we don't leave stale section_number
                    // hanging around when the chapter changes.
                    setAddSectionKey("");
                  }}
                >
                  <SelectTrigger id="wr-chapter">
                    <SelectValue>
                      {addChapterKey === "" && "Top level (no chapter)"}
                      {addChapterKey === "__new__" && "New chapter…"}
                      {addChapterKey && addChapterKey !== "__new__" && (
                        listChapters(parsedRules).find((c) => c.key === addChapterKey)?.label ?? addChapterKey
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__top__">Top level (no chapter)</SelectItem>
                    {listChapters(parsedRules).map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                    <SelectItem value="__new__">New chapter…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {addChapterKey === "__new__" && (
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wr-chnum">Chapter no.</Label>
                  <Input id="wr-chnum" value={addNewChapterNum} onChange={(e) => setAddNewChapterNum(e.target.value)} placeholder="e.g. 5" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wr-chhead">Chapter heading</Label>
                  <Input id="wr-chhead" value={addNewChapterHead} onChange={(e) => setAddNewChapterHead(e.target.value)} placeholder="e.g. Pets and Animals" />
                </div>
              </div>
            )}
            {(addChapterKey === "__new__" || addChapterKey) && (
              <div className="space-y-1.5">
                <Label htmlFor="wr-section">Section</Label>
                <Select
                  value={addSectionKey || "__none__"}
                  onValueChange={(v) => setAddSectionKey(!v || v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="wr-section">
                    <SelectValue>
                      {addSectionKey === "" && "No section"}
                      {addSectionKey === "__new__" && "New section…"}
                      {addSectionKey && addSectionKey !== "__new__" && (() => {
                        if (addChapterKey === "__new__") return addSectionKey;
                        const found = listSectionsInChapter(parsedRules, addChapterKey).find((s) => s.key === addSectionKey);
                        return found?.label ?? addSectionKey;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No section</SelectItem>
                    {addChapterKey !== "__new__" &&
                      listSectionsInChapter(parsedRules, addChapterKey).map((s) => (
                        <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                      ))}
                    <SelectItem value="__new__">New section…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {addSectionKey === "__new__" && (
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wr-secnum">Section no.</Label>
                  <Input id="wr-secnum" value={addNewSectionNum} onChange={(e) => setAddNewSectionNum(e.target.value)} placeholder="e.g. 5.1" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wr-sechead">Section heading</Label>
                  <Input id="wr-sechead" value={addNewSectionHead} onChange={(e) => setAddNewSectionHead(e.target.value)} placeholder="e.g. Dogs" />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="wr-num">
                Rule number <span className="text-destructive">*</span>
              </Label>
              <Input id="wr-num" value={addNumber} onChange={(e) => setAddNumber(e.target.value)} placeholder="e.g. 5.1.2" />
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
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
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
            <Button variant="secondary" onClick={() => setEditIdx(null)}>Cancel</Button>
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
            <Button variant="secondary" onClick={() => setDeleteIdx(null)}>Cancel</Button>
            <Button onClick={commitDelete} className="bg-destructive hover:bg-destructive/90">
              Remove rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
