"use client";

// ============================================================================
// PaymentClaimsContent (PP5-D-C-A)
// ----------------------------------------------------------------------------
// Client wrapper for the manager payment-claims queue. Splits out the
// previously inline page rendering so the orphan chip toggle (?orphan=1)
// can drive client-side URL updates via router.replace, and so the future
// PP5-D-C-B Review action button + dialog can mount alongside per-row
// state.
//
// PP5-D-C-A scope:
//   - Renders pending OR orphaned claims (mutually exclusive lists; chip
//     pivots between them; header copy reflects which list is showing).
//   - NO Review button or dialog yet — deferred to PP5-D-C-B per
//     CLAUDE.md "no half-finished UI affordances".
// ============================================================================

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSubdivisionCode } from "@/lib/subdivision-context";
import {
  OWNER_CLAIM_PAYMENT_METHOD_LABELS,
  type ManagerClaimQueueRow,
} from "@/lib/validations/owner-payment-claims";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface Props {
  rows: ManagerClaimQueueRow[];
  orphanMode: boolean;
}

export function ClaimsContent({ rows, orphanMode }: Props) {
  const router = useRouter();
  const subdivisionCode = useSubdivisionCode();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const base = `/subdivisions/${subdivisionCode}/reconciliation/claims`;

  function toggleOrphanChip() {
    const params = new URLSearchParams(searchParams.toString());
    if (orphanMode) {
      params.delete("orphan");
    } else {
      params.set("orphan", "1");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${base}?${qs}` : base);
    });
  }

  // Header copy reflects which list is showing (Gap W ratification).
  const heading = orphanMode ? "Matched but orphaned" : "Pending claims";
  const subhead = orphanMode
    ? "Matched claims whose linked bank transaction or ledger entry has been voided. Review and re-confirm."
    : "Pending claims submitted by lot owners. Review actions land in PP5-D.";

  // Empty-state copy mirrors the active-list framing.
  const emptyCopy = orphanMode
    ? "No orphaned matched claims. All matched claims still have active bank + ledger links."
    : "No pending payment claims to review.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Payment claims</h1>
        <p className="text-sm text-muted-foreground mt-1">{subhead}</p>
      </div>

      {/* Single-bool chip toggle styled to match FilterChips primitive. */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Review surface
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={orphanMode}
            onClick={toggleOrphanChip}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              orphanMode
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            Matched but orphaned
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {heading}
        </h2>
        <Card>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">{emptyCopy}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((claim) => (
                  <div key={claim.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCurrency(claim.amount)}
                          </span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-sm font-medium">{claim.owner_display_name}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-sm">{claim.lot_label}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                          <span>
                            Paid {format(new Date(`${claim.claim_date}T00:00:00`), "d MMM yyyy")}
                          </span>
                          <span>·</span>
                          <span>{OWNER_CLAIM_PAYMENT_METHOD_LABELS[claim.payment_method]}</span>
                          {claim.reference && (
                            <>
                              <span>·</span>
                              <span>Ref: {claim.reference}</span>
                            </>
                          )}
                          <span>·</span>
                          <span>
                            Submitted {format(new Date(claim.created_at), "d MMM yyyy")}
                          </span>
                        </div>
                        {claim.notes && (
                          <div className="text-xs text-muted-foreground italic">
                            {claim.notes}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {orphanMode ? (
                          <Badge className="rounded-full bg-rose-100 text-rose-900 hover:bg-rose-100">
                            Orphaned
                          </Badge>
                        ) : (
                          <Badge className="rounded-full bg-amber-100 text-amber-900 hover:bg-amber-100">
                            Pending review
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
