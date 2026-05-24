"use client";

// ============================================================================
// FuzzyHintCell , inline hint rendering inside the queue's Description column
// ----------------------------------------------------------------------------
// Renders the original description on the first line and, if a Strategy 6
// fuzzy hint was persisted on the bank_transaction, a clickable "↳ Possibly:
// NAME (Lot N)" line beneath it. Click navigates to the detail page with
// `prefill_lot=lot_id` so the manual-match form can pre-fill the suggested
// lot.
//
// The hint button must `stopPropagation` because the queue row itself is
// clickable (navigates to the same detail page without prefill).
// ============================================================================

import Link from "next/link";
import { cn } from "@/lib/utils";

type FuzzyHintCellProps = {
  description: string | null;
  hint: {
    canonical_name: string;
    lot_label: string;
    lot_id: string;
    similarity: number;
  } | null;
  detailHref: string;
  className?: string;
};

export function FuzzyHintCell({
  description,
  hint,
  detailHref,
  className,
}: FuzzyHintCellProps) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-sm truncate" title={description ?? undefined}>
        {description || (
          <span className="text-muted-foreground italic">No description</span>
        )}
      </p>
      {hint && (
        <Link
          href={`${detailHref}?prefill_lot=${hint.lot_id}`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-block text-xs italic text-muted-foreground",
            "hover:text-foreground hover:underline underline-offset-2",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm",
          )}
        >
          ↳ Possibly: {hint.canonical_name} ({hint.lot_label})
        </Link>
      )}
    </div>
  );
}
