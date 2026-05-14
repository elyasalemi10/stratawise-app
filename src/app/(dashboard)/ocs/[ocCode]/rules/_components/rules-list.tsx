"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ExternalLink, FileText, Loader2, Pencil, Plus, Scale, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OCRule } from "@/lib/actions/oc-rules";
import {
  createOCRule,
  deleteOCRule,
  getRulesSourceUrl,
  updateOCRule,
} from "@/lib/actions/oc-rules";

interface Props {
  ocId: string;
  ocCode: string;
  rules: OCRule[];
  sourceDocumentName: string | null;
}

function RuleTypeBadge({ type }: { type: OCRule["rule_type"] }) {
  if (type === "model") return <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-900">Model</span>;
  if (type === "standing") return <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">Standing</span>;
  return <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">Registered</span>;
}

// Pick the next sequential rule number under the chosen depth + parent.
//
// Depth conventions:
//   1 — top-level chapter: "1", "2", "3" (auto-increment from existing top-level numbers)
//   2 — sub-rule under a chapter: "<parent>.1", "<parent>.2"
//   3 — sub-sub-rule: "<parent>.1.1", "<parent>.1.2"
//
// Used as the default rule_number when the manager hits "Add rule"; they can
// still edit the number before saving (some custom rule schemes use letters
// or non-sequential numbering).
function suggestNextNumber(rules: OCRule[], depth: 1 | 2 | 3, parentNumber: string): string {
  if (depth === 1) {
    const tops = rules
      .map((r) => r.rule_number.split(".")[0])
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const max = tops.length > 0 ? Math.max(...tops) : 0;
    return String(max + 1);
  }
  const prefix = parentNumber.endsWith(".") ? parentNumber : `${parentNumber}.`;
  const peers = rules
    .map((r) => r.rule_number)
    .filter((n) => n.startsWith(prefix))
    .map((n) => {
      const rest = n.slice(prefix.length);
      const next = rest.split(".")[0];
      return parseInt(next, 10);
    })
    .filter((n) => Number.isFinite(n));
  const max = peers.length > 0 ? Math.max(...peers) : 0;
  return `${prefix}${max + 1}`;
}

// Filter the rules list to "potential parents" for a given depth. depth=2
// wants top-level rules ("1", "2", "3"); depth=3 wants 2-segment rules
// ("1.1", "2.4", etc.). Bypasses the depth=1 case (no parent picker).
function candidateParents(rules: OCRule[], depth: 2 | 3): OCRule[] {
  return rules.filter((r) => r.rule_number.split(".").length === depth - 1);
}

export function RulesList({ ocId, ocCode, rules, sourceDocumentName }: Props) {
  void ocCode;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState<number | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);

  // Create dialog state. Type (registered / standing) is picked from the
  // dropdown that opens the dialog, so the user always knows what they're
  // adding before they see the form.
  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState<"registered" | "standing">("standing");
  const [newDepth, setNewDepth] = useState<1 | 2 | 3>(1);
  const [newParent, setNewParent] = useState<string>("");
  const [newNumber, setNewNumber] = useState("");
  const [newHeading, setNewHeading] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newPending, setNewPending] = useState(false);

  // Edit dialog state.
  const [editRule, setEditRule] = useState<OCRule | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [editHeading, setEditHeading] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editType, setEditType] = useState<OCRule["rule_type"]>("registered");
  const [editPending, setEditPending] = useState(false);

  // Delete confirm state.
  const [deleteRule, setDeleteRule] = useState<OCRule | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const filtered = query.trim()
    ? rules.filter((r) => {
        const q = query.toLowerCase();
        return (
          r.rule_number.toLowerCase().includes(q) ||
          (r.heading ?? "").toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q)
        );
      })
    : rules;

  // Side-panel viewer. Loads the PDF URL lazily on first open and re-uses
  // the same iframe for subsequent rule clicks (just bumps the page hash).
  // When the rule wasn't extracted from a PDF (hand-authored, or old data),
  // surface a toast instead of silently no-op'ing.
  async function openViewerForRule(rule: OCRule) {
    if (!rule.source_document_id) {
      toast("This rule isn't linked to a PDF — it was added by hand.");
      return;
    }
    setActiveRuleId(rule.id);
    if (!viewerUrl) {
      setViewerLoading(true);
      const r = await getRulesSourceUrl(ocId);
      setViewerLoading(false);
      if (!r.url) {
        toast.error("Couldn't load the rules PDF — try again in a moment.");
        setActiveRuleId(null);
        return;
      }
      setViewerUrl(r.url);
    }
    setViewerPage(rule.page_number ?? 1);
  }

  function closeViewer() {
    setActiveRuleId(null);
    setViewerPage(null);
  }

  const iframeSrc = viewerUrl && viewerPage
    ? `${viewerUrl}#page=${viewerPage}&zoom=auto`
    : viewerUrl ?? "";

  // Open the create dialog with sensible defaults for the chosen type.
  function openCreate(type: "registered" | "standing") {
    setNewType(type);
    setNewDepth(1);
    setNewParent("");
    setNewNumber(suggestNextNumber(rules, 1, ""));
    setNewHeading("");
    setNewBody("");
    setCreateOpen(true);
  }

  // When the depth or parent changes, refresh the suggested rule_number so
  // the user doesn't have to recompute it themselves.
  function setDepth(d: 1 | 2 | 3) {
    setNewDepth(d);
    if (d === 1) {
      setNewParent("");
      setNewNumber(suggestNextNumber(rules, 1, ""));
    } else if (newParent) {
      setNewNumber(suggestNextNumber(rules, d, newParent));
    } else {
      setNewNumber("");
    }
  }
  function setParent(parentNumber: string) {
    setNewParent(parentNumber);
    setNewNumber(suggestNextNumber(rules, newDepth as 2 | 3, parentNumber));
  }

  async function onCreate() {
    if (!newNumber.trim()) {
      toast.error("Rule number is required.");
      return;
    }
    if (!newBody.trim()) {
      toast.error("Rule body is required.");
      return;
    }
    setNewPending(true);
    const r = await createOCRule({
      oc_id: ocId,
      rule_number: newNumber,
      heading: newHeading || null,
      body: newBody,
      rule_type: newType,
    });
    setNewPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Rule added.");
    setCreateOpen(false);
    router.refresh();
  }

  function openEdit(rule: OCRule, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setEditRule(rule);
    setEditNumber(rule.rule_number);
    setEditHeading(rule.heading ?? "");
    setEditBody(rule.body);
    setEditType(rule.rule_type);
  }

  async function onSaveEdit() {
    if (!editRule) return;
    if (!editNumber.trim() || !editBody.trim()) {
      toast.error("Rule number and body are both required.");
      return;
    }
    setEditPending(true);
    const r = await updateOCRule({
      rule_id: editRule.id,
      rule_number: editNumber,
      heading: editHeading || null,
      body: editBody,
      rule_type: editType === "model" ? "registered" : editType,
    });
    setEditPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Rule updated.");
    setEditRule(null);
    router.refresh();
  }

  function openDelete(rule: OCRule, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setDeleteRule(rule);
  }

  async function onConfirmDelete() {
    if (!deleteRule) return;
    setDeletePending(true);
    const r = await deleteOCRule(deleteRule.id);
    setDeletePending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Rule removed.");
    setDeleteRule(null);
    router.refresh();
  }

  const viewerOpen = activeRuleId != null && viewerPage != null;
  const parentOptions = newDepth === 1 ? [] : candidateParents(rules, newDepth);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {sourceDocumentName ? (
          <p className="text-xs text-muted-foreground">
            Read from <span className="font-medium text-foreground">{sourceDocumentName}</span>
          </p>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search rules…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          {/* Add rule = dropdown picker so the manager picks Registered or
              Standing up-front. Per the OC Act, registered rules are filed
              with Land Use Victoria; standing rules are committee policies
              that bind owners without separate registration. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add rule
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openCreate("registered")}>
                <Scale className="mr-2 h-3.5 w-3.5 text-emerald-700" />
                Registered rule
                <span className="ml-auto text-[10px] text-muted-foreground">Land Use Victoria</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openCreate("standing")}>
                <FileText className="mr-2 h-3.5 w-3.5 text-amber-700" />
                Standing rule
                <span className="ml-auto text-[10px] text-muted-foreground">Committee policy</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Layout: rule cards on the left, PDF viewer pinned on the right when
          a rule with a source document is selected. The split is fluid — the
          viewer claims half the width only when open, so the list reads at
          full width by default. */}
      <div className={`flex flex-col gap-4 ${viewerOpen ? "lg:flex-row" : ""}`}>
        <div className={viewerOpen ? "lg:flex-1 lg:min-w-0" : "w-full"}>
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {query.trim() ? <>No rules match &ldquo;{query.trim()}&rdquo;.</> : "No rules yet — add one above."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((rule) => {
                const isActive = activeRuleId === rule.id;
                const hasSource = !!rule.source_document_id;
                return (
                  <Card
                    key={rule.id}
                    onClick={() => openViewerForRule(rule)}
                    className={`group relative transition-colors cursor-pointer ${
                      isActive ? "border-primary" : "hover:border-primary/40"
                    } ${hasSource ? "" : "opacity-95"}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-foreground">{rule.rule_number}</span>
                            {rule.heading && (
                              <span className="text-sm font-semibold text-foreground">{rule.heading}</span>
                            )}
                            <RuleTypeBadge type={rule.rule_type} />
                            {rule.confidence != null && rule.confidence < 0.6 && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                                Low confidence
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{rule.body}</p>
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          {hasSource && rule.page_number && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              p.{rule.page_number}
                            </span>
                          )}
                          {/* Hover-only pencil / trash. Stop propagation so
                              clicks don't also bubble to the card's "open
                              the PDF" handler. */}
                          <div className="hidden items-center gap-1 group-hover:flex">
                            <button
                              type="button"
                              onClick={(e) => openEdit(rule, e)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="Edit rule"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => openDelete(rule, e)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Delete rule"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {viewerOpen && (
          <div className="lg:flex-1 lg:min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-foreground truncate">{sourceDocumentName ?? "Rules source"}</span>
                <span className="text-xs text-muted-foreground">— page {viewerPage}</span>
                <div className="ml-auto flex items-center gap-2">
                  {viewerUrl && (
                    <a
                      href={viewerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open full
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={closeViewer}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Close viewer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {viewerLoading ? (
                <div className="flex h-[75vh] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : (
                <iframe src={iframeSrc} title="OC Rules PDF" className="h-[75vh] w-full" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create rule dialog. Heading is optional; the "level" picker is the
          UX layer over rule_number's dotted notation — 1 = top-level,
          2 = sub-rule, 3 = sub-sub-rule. The rule_number field stays
          editable so non-numeric schemes (e.g. "S-2026-01") still work. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Add {newType === "standing" ? "standing" : "registered"} rule
            </DialogTitle>
            <DialogDescription>
              {newType === "standing"
                ? "Committee-adopted internal rules that aren't filed with Land Use Victoria."
                : "Filed with Land Use Victoria. Use this for any rule that's part of the OC's registered set."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Level + parent picker */}
            <div className="grid grid-cols-[1fr_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rl-depth">Level</Label>
                <Select value={String(newDepth)} onValueChange={(v) => setDepth((parseInt(v ?? "1", 10) || 1) as 1 | 2 | 3)}>
                  <SelectTrigger id="rl-depth">
                    <SelectValue>
                      {newDepth === 1 ? "Top-level rule"
                        : newDepth === 2 ? "Sub-rule"
                        : "Sub-sub-rule"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Top-level rule (e.g. 1, 2, 3)</SelectItem>
                    <SelectItem value="2">Sub-rule (e.g. 1.1, 1.2)</SelectItem>
                    <SelectItem value="3">Sub-sub-rule (e.g. 1.1.1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newDepth > 1 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="rl-parent">Goes under</Label>
                  <Select value={newParent || undefined} onValueChange={(v) => setParent(v ?? "")}>
                    <SelectTrigger id="rl-parent" aria-invalid={parentOptions.length === 0 || undefined}>
                      <SelectValue placeholder="Pick the parent rule">
                        {newParent ? `Rule ${newParent}` : ""}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No parent rules at this level yet.
                        </div>
                      ) : (
                        parentOptions.map((p) => (
                          <SelectItem key={p.id} value={p.rule_number}>
                            {p.rule_number}{p.heading ? ` — ${p.heading}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="rl-num">
                    Rule number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="rl-num"
                    placeholder="Rule number"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                  />
                </div>
              )}
            </div>
            {/* Rule number gets its own row at depth>1 so it can sit alongside
                the parent picker without cramping. */}
            {newDepth > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="rl-num">
                  Rule number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rl-num"
                  placeholder="Rule number"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rl-heading">Heading</Label>
              <Input
                id="rl-heading"
                placeholder="Short title for the rule"
                value={newHeading}
                onChange={(e) => setNewHeading(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rl-body">
                Body <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rl-body"
                placeholder="Full text of the rule"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={newPending}>Cancel</Button>
            <Button onClick={onCreate} disabled={newPending}>
              {newPending && <Loader2 className="size-4 animate-spin" />}
              Add rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit rule dialog. */}
      <Dialog open={editRule != null} onOpenChange={(open) => { if (!open) setEditRule(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="er-type">Type</Label>
                <Select
                  value={editType === "model" ? "registered" : editType}
                  onValueChange={(v) => setEditType((v as "registered" | "standing") ?? "standing")}
                >
                  <SelectTrigger id="er-type">
                    <SelectValue>{editType === "standing" ? "Standing" : "Registered"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="standing">Standing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="er-num">
                  Rule number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="er-num"
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="er-heading">Heading</Label>
              <Input
                id="er-heading"
                value={editHeading}
                onChange={(e) => setEditHeading(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="er-body">
                Body <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="er-body"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRule(null)} disabled={editPending}>Cancel</Button>
            <Button onClick={onSaveEdit} disabled={editPending}>
              {editPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm. */}
      <Dialog open={deleteRule != null} onOpenChange={(open) => { if (!open) setDeleteRule(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this rule?</DialogTitle>
            <DialogDescription>
              {deleteRule && (
                <>Rule <strong className="text-foreground">{deleteRule.rule_number}</strong>{deleteRule.heading ? ` — ${deleteRule.heading}` : ""} will be deleted. The source document, if any, stays in the documents tab.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteRule(null)} disabled={deletePending}>Cancel</Button>
            <Button onClick={onConfirmDelete} disabled={deletePending} className="bg-destructive hover:bg-destructive/90">
              {deletePending && <Loader2 className="size-4 animate-spin" />}
              Remove rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
