"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  dismissGapReport,
  getActiveGapReportForSubdivision,
  type GapReportBannerData,
} from "@/lib/actions/basiq";
import { Button } from "@/components/ui/button";
import { useSubdivisionCode } from "@/lib/subdivision-context";

// ============================================================================
// Gap reconciliation banner
// ----------------------------------------------------------------------------
// Appears at the top of the bank-account page when the subdivision has a
// gap report that hasn't been dismissed yet. Tells the manager how many
// transactions were backfilled, auto-matched, and still need review, and
// when arrears notifications resume.
// ============================================================================

export function GapReconciliationBanner({
  subdivisionId,
}: {
  subdivisionId: string;
}) {
  const subdivisionCode = useSubdivisionCode();
  const [report, setReport] = useState<GapReportBannerData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const r = await getActiveGapReportForSubdivision(subdivisionId);
    setReport(r);
    setLoaded(true);
  }, [subdivisionId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function onDismiss() {
    if (!report) return;
    startTransition(async () => {
      const res = await dismissGapReport(report.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setReport(null);
    });
  }

  if (!loaded || !report) return null;

  const days = Math.max(1, Math.round(report.gapDurationHours / 24));

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-md border border-[hsl(38,92%,50%)]/30 bg-[hsl(38,92%,50%)]/10 p-4"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(38,92%,50%)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Reconciliation gap: bank feed was disconnected for {days} day
          {days === 1 ? "" : "s"}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {report.backfilledTransactionCount} transaction
          {report.backfilledTransactionCount === 1 ? "" : "s"} imported,{" "}
          {report.autoMatchedCount} auto-matched,{" "}
          {report.manualReviewCount} need manual review.
          {report.suppressionUntil && " Arrears notifications paused for 48 hours."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/subdivisions/${subdivisionCode}/reconciliation/gap-reports/${report.id}`}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90"
          >
            View gap report
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={onDismiss}
            disabled={pending}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
