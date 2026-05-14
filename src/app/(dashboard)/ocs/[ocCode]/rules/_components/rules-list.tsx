"use client";

import { useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OCRule } from "@/lib/actions/oc-rules";
import { getRulesSourceUrl } from "@/lib/actions/oc-rules";

interface Props {
  ocId: string;
  ocCode: string;
  rules: OCRule[];
  sourceDocumentName: string | null;
}

export function RulesList({ ocId, ocCode, rules, sourceDocumentName }: Props) {
  void ocCode;
  const [query, setQuery] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState<number | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

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

  async function openViewer(rule: OCRule) {
    setLoadingUrl(true);
    let url = viewerUrl;
    if (!url) {
      const r = await getRulesSourceUrl(ocId);
      url = r.url;
      setViewerUrl(url);
    }
    setLoadingUrl(false);
    if (!url) return;
    setViewerPage(rule.page_number ?? 1);
    setViewerOpen(true);
  }

  // Build the iframe src with the #page= anchor on each open. Browsers
  // re-navigate the iframe when src changes; we set the URL once and append
  // the page anchor on each viewer open.
  const iframeSrc = viewerUrl && viewerPage
    ? `${viewerUrl}#page=${viewerPage}&zoom=auto`
    : viewerUrl ?? "";

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
        <Input
          placeholder="Search rules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No rules match &ldquo;{query.trim()}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{rule.rule_number}</span>
                      {rule.heading && (
                        <span className="text-sm font-semibold text-foreground">{rule.heading}</span>
                      )}
                      {rule.confidence != null && rule.confidence < 0.6 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                          Low confidence
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{rule.body}</p>
                  </div>
                  {rule.source_document_id && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void openViewer(rule)}
                      disabled={loadingUrl}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      {rule.page_number ? `View — p.${rule.page_number}` : "View source"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-5xl p-0">
          <DialogHeader className="px-6 pt-4">
            <DialogTitle className="flex items-center gap-2 text-sm">
              {sourceDocumentName ?? "Source PDF"}
              {viewerPage && (
                <span className="text-xs text-muted-foreground">— page {viewerPage}</span>
              )}
              {viewerUrl && (
                <a
                  href={viewerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open in new tab
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-4">
            {iframeSrc ? (
              <iframe
                src={iframeSrc}
                title="OC Rules PDF"
                className="w-full h-[75vh] rounded-md border border-border"
              />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
