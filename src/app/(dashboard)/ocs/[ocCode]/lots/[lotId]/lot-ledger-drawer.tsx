"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLedgerEntryDetail } from "@/lib/actions/ledger";
import type { LedgerEntryDetail, LotLedgerEntry } from "@/lib/validations/ledger";
import { useOCCode } from "@/lib/oc-context";
import { AlertTriangle } from "lucide-react";
import {
  LedgerDuplicateReviewDialog,
  type LedgerDuplicateReviewPayload,
} from "@/components/reconciliation/ledger-duplicate-review-dialog";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const CATEGORY_LABELS: Record<string, string> = {
  levy: "Levy",
  special_levy: "Special levy",
  interest: "Interest",
  payment: "Payment",
  writeoff: "Write-off",
  adjustment_debit: "Debit adjustment",
  adjustment_credit: "Credit adjustment",
  refund: "Refund",
  void_offset: "Void offset",
};

// ─── Detail rows ────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-border/50 last:border-b-0 gap-4">
      <span className="text-xs text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="text-xs text-foreground text-right break-all">{children}</span>
    </div>
  );
}

// ─── Section heading ────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 mt-5 first:mt-0">
      {children}
    </p>
  );
}

// ─── Related entry summary ──────────────────────────────────────

function RelatedEntryCard({ entry, label }: { entry: LotLedgerEntry; label: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-xs font-medium text-foreground">
        {CATEGORY_LABELS[entry.category] ?? entry.category} · {formatDate(entry.entry_date)} · {formatCurrency(entry.amount)}
      </p>
      {entry.reference && (
        <p className="text-xs font-mono text-muted-foreground mt-0.5">{entry.reference}</p>
      )}
      {entry.description && (
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>
      )}
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────

function DrawerSkeleton() {
  return (
    <div className="px-4 space-y-3">
      {[120, 80, 100, 90, 110].map((w, i) => (
        <div key={i} className="flex justify-between py-2 border-b border-border/50">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className={`h-3 rounded bg-muted animate-pulse`} style={{ width: w }} />
        </div>
      ))}
      <div className="mt-5">
        <div className="h-3 w-20 rounded bg-muted animate-pulse mb-3" />
        <div className="rounded-md border border-border bg-muted/30 p-3 h-16 animate-pulse" />
      </div>
    </div>
  );
}

// ─── Drawer ─────────────────────────────────────────────────────

export function LedgerEntryDrawer({
  entryId,
  ocId,
  open,
  onOpenChange,
}: {
  entryId: string | null;
  ocId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  void ocId;
  const ocCode = useOCCode();
  const [detail, setDetail] = useState<LedgerEntryDetail | null>(null);
  const [isPending, startTransition] = useTransition();

  // PP5-D-B: ledger-side duplicate review dialog state for the drawer.
  const [ledgerDupOpen, setLedgerDupOpen] = useState(false);

  useEffect(() => {
    if (!entryId || !open) return;
    setDetail(null);
    startTransition(async () => {
      try {
        const d = await getLedgerEntryDetail(entryId);
        setDetail(d);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load entry details");
        onOpenChange(false);
      }
    });
  }, [entryId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const entry = detail?.entry;
  const sourceLink = detail?.sourceLink;
  const auditTrail = detail?.auditTrail ?? [];
  const relatedEntry = detail?.relatedEntry;

  const isLoading = isPending || (open && !detail && !!entryId);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Override translate animations — fade-in only per CLAUDE.md
        className="sm:max-w-lg overflow-y-auto [&[data-starting-style]]:!translate-x-0 [&[data-ending-style]]:!translate-x-0"
      >
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle>Ledger entry</SheetTitle>
          {entry && (
            <p className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[entry.category] ?? entry.category} · {formatDate(entry.entry_date)}
            </p>
          )}
        </SheetHeader>

        <div className="px-4 pb-4">
          {isLoading && <DrawerSkeleton />}

          {!isLoading && entry && (
            <div>
              {/* ── Entry details ────────────────────────── */}
              <SectionHeading>Entry details</SectionHeading>

              <DetailRow label="Date">{formatDate(entry.entry_date)}</DetailRow>
              <DetailRow label="Fund">
                {entry.fund_type === "administrative" ? "Administrative" : "Capital works"}
              </DetailRow>
              <DetailRow label="Type">
                <Badge
                  className={cn(
                    "rounded-full",
                    entry.entry_type === "credit"
                      ? "bg-secondary/10 text-secondary hover:bg-secondary/10"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/10",
                  )}
                >
                  {entry.entry_type === "credit" ? "Credit" : "Debit"}
                </Badge>
              </DetailRow>
              <DetailRow label="Category">{CATEGORY_LABELS[entry.category] ?? entry.category}</DetailRow>
              <DetailRow label="Amount">
                <span className={cn(
                  "font-medium",
                  entry.entry_type === "credit" ? "text-secondary" : "text-destructive",
                )}>
                  {entry.entry_type === "debit" ? "-" : "+"}{formatCurrency(entry.amount)}
                </span>
              </DetailRow>
              {entry.reference && (
                <DetailRow label="Reference">
                  <span className="font-mono">{entry.reference}</span>
                </DetailRow>
              )}
              {entry.description && (
                <DetailRow label="Description">{entry.description}</DetailRow>
              )}
              <DetailRow label="Status">
                <Badge
                  className={cn(
                    "rounded-full",
                    entry.status === "voided"
                      ? "bg-muted text-muted-foreground hover:bg-muted"
                      : "bg-secondary/10 text-secondary hover:bg-secondary/10",
                  )}
                >
                  {entry.status === "voided" ? "Voided" : "Active"}
                </Badge>
              </DetailRow>
              <DetailRow label="Created">{formatDateTime(entry.created_at)}</DetailRow>
              {entry.status === "voided" && entry.voided_at && (
                <DetailRow label="Voided at">{formatDateTime(entry.voided_at)}</DetailRow>
              )}
              {entry.status === "voided" && entry.void_reason && (
                <DetailRow label="Void reason">{entry.void_reason}</DetailRow>
              )}
              <DetailRow label="Entry ID">
                <span className="font-mono text-[10px] text-muted-foreground">{entry.id}</span>
              </DetailRow>

              {/* PP5-D-B: ledger-side duplicate review affordance.
                  Surfaces only on entries flagged duplicate_status='suspected'
                  with detection metadata. Click → LedgerDuplicateReviewDialog. */}
              {entry.duplicate_status === "suspected" && entry.duplicate_metadata && (
                <>
                  <SectionHeading>Possible duplicate</SectionHeading>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
                      <div className="text-xs text-amber-900 space-y-2">
                        <p>
                          The detector flagged this credit as a possible duplicate of an earlier
                          payment on the same levy notice.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setLedgerDupOpen(true)}
                        >
                          Review duplicate
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Source chain ─────────────────────────── */}
              {sourceLink && (
                <>
                  {(entry.category === "levy" || entry.category === "special_levy") &&
                    sourceLink.levyBatchId && (
                      <>
                        <SectionHeading>Source</SectionHeading>
                        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                          <div>
                            <p className="text-xs font-medium text-foreground">Levy notice</p>
                            {sourceLink.levyReference && (
                              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                                {sourceLink.levyReference}
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/ocs/${ocCode}/levies/${sourceLink.levyBatchId}`}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            View batch
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </>
                    )}

                  {entry.category === "payment" && entry.entry_type === "credit" && (
                    <>
                      <SectionHeading>Source</SectionHeading>
                      {sourceLink.bankTxnId ? (
                        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                          <div>
                            <p className="text-xs font-medium text-foreground">Bank transaction match</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Matched via reconciliation queue
                            </p>
                          </div>
                          <Link
                            href={`/ocs/${ocCode}/reconciliation/${sourceLink.bankTxnId}`}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            View match
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      ) : sourceLink.receiptId ? (
                        <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                          <div>
                            <p className="text-xs font-medium text-foreground">Cash/cheque receipt</p>
                            {sourceLink.receiptNumber && (
                              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                                {sourceLink.receiptNumber}
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/ocs/${ocCode}/bank-account`}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            View receipts
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No source link available.</p>
                      )}
                    </>
                  )}

                  {entry.category === "void_offset" && relatedEntry && (
                    <>
                      <SectionHeading>Reversal of</SectionHeading>
                      <RelatedEntryCard
                        entry={relatedEntry}
                        label="Original entry"
                      />
                    </>
                  )}
                </>
              )}

              {/* Related entry for voided non-void_offset entries */}
              {entry.status === "voided" && entry.category !== "void_offset" && relatedEntry && (
                <>
                  <SectionHeading>Void offset entry</SectionHeading>
                  <RelatedEntryCard
                    entry={relatedEntry}
                    label="Reversing entry created at void"
                  />
                </>
              )}

              {/* ── Audit trail ──────────────────────────── */}
              <SectionHeading>Activity</SectionHeading>
              {auditTrail.length === 0 ? (
                <p className="text-xs text-muted-foreground">No audit log entries for this record.</p>
              ) : (
                <div className="space-y-2">
                  {auditTrail.map((log) => (
                    <div key={log.id} className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">{log.action}</p>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {formatDateTime(log.created_at)}
                        </p>
                      </div>
                      {log.performed_by_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          by {log.performed_by_name}
                        </p>
                      )}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <details className="mt-1">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Metadata
                          </summary>
                          <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                      {(log.before_state || log.after_state) && (
                        <details className="mt-1">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            State diff
                          </summary>
                          {log.before_state && (
                            <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                              <span className="text-destructive">− before: </span>
                              {JSON.stringify(log.before_state, null, 2)}
                            </pre>
                          )}
                          {log.after_state && (
                            <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                              <span className="text-secondary">+ after: </span>
                              {JSON.stringify(log.after_state, null, 2)}
                            </pre>
                          )}
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          <SheetClose render={<Button variant="outline" />}>
            Close
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {/* PP5-D-B: ledger-side duplicate review dialog. Mounted as a sibling
        to the Sheet (not nested) so the Dialog primitive's portal is
        independent. onResolved closes the Sheet too — the entry's state
        has changed and stale drawer data shouldn't persist (Gap J). */}
    {entry && entry.duplicate_metadata && entry.duplicate_status && (() => {
      const meta = entry.duplicate_metadata as {
        matched_against?: string;
        lot_id?: string;
        levy_notice_id?: string;
        amount?: number;
        day_delta?: number;
        older_category?: string;
        newer_category?: string;
      };
      if (
        !meta.matched_against ||
        !meta.lot_id ||
        !meta.levy_notice_id ||
        typeof meta.amount !== "number" ||
        typeof meta.day_delta !== "number" ||
        !meta.older_category ||
        !meta.newer_category
      ) {
        return null;
      }
      const dialogPayload: LedgerDuplicateReviewPayload = {
        lot_ledger_entry_id: entry.id,
        oc_id: entry.oc_id,
        current: {
          entry_date: entry.entry_date,
          amount: entry.amount,
          fund_type: entry.fund_type,
          levy_notice_id: entry.levy_notice_id,
          description: entry.description,
        },
        duplicate_metadata: {
          matched_against: meta.matched_against,
          lot_id: meta.lot_id,
          levy_notice_id: meta.levy_notice_id,
          amount: meta.amount,
          day_delta: meta.day_delta,
          older_category: meta.older_category,
          newer_category: meta.newer_category,
        },
        duplicate_status: entry.duplicate_status,
        parent_status: entry.parent_status,
      };
      return (
        <LedgerDuplicateReviewDialog
          open={ledgerDupOpen}
          onOpenChange={setLedgerDupOpen}
          payload={dialogPayload}
          onResolved={() => {
            // Auto-close the drawer Sheet after a successful action — the
            // entry's state has changed and the drawer's stale data
            // shouldn't persist (PP5-D-B Gap J ratification).
            onOpenChange(false);
          }}
        />
      );
    })()}
    </>
  );
}
