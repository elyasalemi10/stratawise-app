"use client";

// ============================================================================
// DuplicateBadge , bank-side "Possible duplicate" inline badge (PP5-D-A)
// ----------------------------------------------------------------------------
// Renders the existing Badge primitive with `variant="warning"` (amber).
// Mirrors the ReviewSuggestedBadge shape from PP4-D, with a distinct label
// and click-handler. When `onClick` is supplied the badge becomes a button
// (opens BankDuplicateReviewDialog); otherwise it's a static span.
//
// Surfaced when bank_transactions.duplicate_status === 'suspected'.
// 'confirmed' rows are excluded from the queue by default; 'rejected'
// rows render normally with no badge.
//
// Priority on queue rows: when a row has BOTH duplicate_status='suspected'
// AND a fuzzy hint, render DuplicateBadge only (suppress FuzzyHintCell).
// See PP5-D-0 ratification , the duplicate review takes precedence over
// the fuzzy-hint suggestion. Priority logic lives in the queue row
// renderer, not in this component.
// ============================================================================

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DuplicateBadgeProps = {
  onClick?: () => void;
  className?: string;
  /** Optional override for the visible label. Default: "Possible duplicate". */
  label?: string;
};

export function DuplicateBadge({
  onClick,
  className,
  label = "Possible duplicate",
}: DuplicateBadgeProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label="Review suspected duplicate"
        className={cn(
          "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          className,
        )}
      >
        <Badge
          variant="warning"
          className="cursor-pointer hover:bg-[hsl(38,92%,50%)]/20"
        >
          {label}
        </Badge>
      </button>
    );
  }

  return (
    <Badge variant="warning" className={className}>
      {label}
    </Badge>
  );
}
