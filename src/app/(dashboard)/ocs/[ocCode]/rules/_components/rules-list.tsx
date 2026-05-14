"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, Plus, X } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OCRule } from "@/lib/actions/oc-rules";
import { createOCRule, getRulesSourceUrl } from "@/lib/actions/oc-rules";

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

export function RulesList({ ocId, ocCode, rules, sourceDocumentName }: Props) {
  void ocCode;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState<number | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);

  // Manual rule creation panel.
  const [creating, setCreating] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newHeading, setNewHeading] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newType, setNewType] = useState<"registered" | "standing">("standing");
  const [newPending, setNewPending] = useState(false);

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

  // Side-panel viewer. Opens when the user clicks any rule that has a
  // source_document_id; loads the PDF URL lazily on first open and re-uses
  // the same iframe for subsequent rule clicks (just bumps the page hash).
  async function openViewerForRule(rule: OCRule) {
    if (!rule.source_document_id) return;
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
    setNewNumber("");
    setNewHeading("");
    setNewBody("");
    setCreating(false);
    router.refresh();
  }

  const viewerOpen = activeRuleId != null && viewerPage != null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {sourceDocumentName ? (
          <p className="text-xs text-muted-foreground">
            Parsed from <span className="font-medium text-foreground">{sourceDocumentName}</span>
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
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add rule
          </Button>
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
                No rules match &ldquo;{query.trim()}&rdquo;.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((rule) => {
                const isActive = activeRuleId === rule.id;
                return (
                  <Card
                    key={rule.id}
                    onClick={() => openViewerForRule(rule)}
                    className={`cursor-pointer transition-colors ${
                      isActive ? "border-primary" : "hover:border-primary/40"
                    } ${rule.source_document_id ? "" : "cursor-default"}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
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
                        {rule.source_document_id && rule.page_number && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                            <FileText className="h-3 w-3" />
                            p.{rule.page_number}
                          </span>
                        )}
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

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a rule</DialogTitle>
            <DialogDescription>
              For one-off additions or for committee-adopted standing rules that aren&apos;t
              registered with Land Use Victoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rt">
                  Type <span className="text-destructive">*</span>
                </Label>
                <Select value={newType} onValueChange={(v) => setNewType((v as "registered" | "standing") ?? "standing")}>
                  <SelectTrigger id="rt">
                    <SelectValue>{newType === "standing" ? "Standing" : "Registered"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standing">Standing</SelectItem>
                    <SelectItem value="registered">Registered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rn">
                  Rule number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rn"
                  placeholder="Rule number (e.g. 8.2.1 or S-2026-01)"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rh">Heading</Label>
              <Input
                id="rh"
                placeholder="Short title for the rule"
                value={newHeading}
                onChange={(e) => setNewHeading(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rb">
                Body <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rb"
                placeholder="Full text of the rule"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={newPending}>Cancel</Button>
            <Button onClick={onCreate} disabled={newPending}>
              {newPending && <Loader2 className="size-4 animate-spin" />}
              Add rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
