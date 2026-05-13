"use client";

// ============================================================================
// MatchMetadataDrawer — read-only side drawer showing strategies_tried
// ----------------------------------------------------------------------------
// Sourced from the orchestrator's audit_log entry written by
// `writeOrchestratorAudit` in src/lib/reconciliation/orchestrator.ts. The
// drawer itself is presentational — the parent passes the loaded payload
// (or undefined while loading) via the `audit` prop.
//
// `audit` semantics:
//   undefined → still loading; render skeletons
//   null      → no orchestrator audit row exists for this transaction (e.g.
//               the transaction was created before PP4-A or auto-match was
//               skipped). Render a clear empty state.
//   payload   → normal render
// ============================================================================

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StrategyAttempt, StrategyName } from "@/lib/reconciliation/orchestrator";

export type { StrategyAttempt, StrategyName };

export type MatchAuditPayload = {
  strategies_tried: StrategyAttempt[];
  matched_via: StrategyName | null;
  hint_surfaced: boolean;
  /** ISO timestamp from audit_log.created_at */
  evaluated_at: string;
};

type MatchMetadataDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: MatchAuditPayload | null | undefined;
  bankTxnDescription?: string;
};

const STRATEGY_LABELS: Record<StrategyName, string> = {
  deft_drn: "DEFT Reference Number",
  reference: "Levy reference",
  bpay_crn: "BPAY CRN",
  known_payer: "Known payer",
  keyword_amount: "Keyword + amount",
  amount_window: "Amount window",
  fuzzy_hint: "Fuzzy hint",
};

function strategyVariant(
  attempt: StrategyAttempt,
  matchedVia: StrategyName | null,
): "success" | "warning" | "neutral" {
  if (attempt.strategy === matchedVia) return "success";
  // Strategy 6 surfaces a hint without auto-matching; show as warning when it
  // fired even though it never sets `matched_via`.
  if (
    attempt.strategy === "fuzzy_hint" &&
    attempt.outcome === "hint_surfaced"
  ) {
    return "warning";
  }
  return "neutral";
}

export function MatchMetadataDrawer({
  open,
  onOpenChange,
  audit,
  bankTxnDescription,
}: MatchMetadataDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Match details</SheetTitle>
          <SheetDescription>
            Strategies the auto-matcher attempted for this transaction.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {bankTxnDescription && (
            <section className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Description
              </div>
              <p className="text-sm break-words">{bankTxnDescription}</p>
            </section>
          )}

          <section className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Strategies tried
            </div>

            {audit === undefined && (
              <div className="space-y-2">
                <div className="h-12 animate-pulse rounded-md bg-muted" />
                <div className="h-12 animate-pulse rounded-md bg-muted" />
                <div className="h-12 animate-pulse rounded-md bg-muted" />
              </div>
            )}

            {audit === null && (
              <p className="text-sm text-muted-foreground">
                No orchestrator audit recorded for this transaction.
              </p>
            )}

            {audit && audit.strategies_tried.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Auto-match did not run on this transaction.
              </p>
            )}

            {audit?.strategies_tried.map((attempt, idx) => (
              <div
                key={`${attempt.strategy}-${idx}`}
                className="rounded-md border border-border p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {STRATEGY_LABELS[attempt.strategy] ?? attempt.strategy}
                  </div>
                  <Badge variant={strategyVariant(attempt, audit.matched_via)}>
                    {attempt.outcome}
                  </Badge>
                </div>
                {attempt.details &&
                  Object.keys(attempt.details).length > 0 && (
                    <pre
                      className={cn(
                        "text-xs text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto",
                        "whitespace-pre-wrap break-words",
                      )}
                    >
                      {JSON.stringify(attempt.details, null, 2)}
                    </pre>
                  )}
              </div>
            ))}
          </section>

          {audit?.hint_surfaced && (
            <section className="rounded-md border border-[hsl(38,92%,50%)]/30 bg-[hsl(38,92%,50%)]/5 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-[hsl(38,92%,35%)]">
                Hint surfaced
              </div>
              <p className="mt-1 text-sm">
                Strategy 6 found a similar known payer. The hint is shown on the
                queue row for manual review; auto-match never fires from a fuzzy
                hint alone.
              </p>
            </section>
          )}

          {audit && (
            <section className="text-xs text-muted-foreground">
              Evaluated {new Date(audit.evaluated_at).toLocaleString()}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
