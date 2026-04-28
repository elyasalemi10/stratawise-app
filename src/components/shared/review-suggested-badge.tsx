"use client";

// ============================================================================
// ReviewSuggestedBadge — amber inline badge for `review_required` matches
// ----------------------------------------------------------------------------
// Renders the existing Badge primitive with `variant="warning"`. When
// `onClick` is supplied the badge becomes a button (opens the parent's
// metadata drawer); otherwise it's a static span.
//
// Anchors against the `warning` variant verified in
// `src/components/ui/badge.tsx` (line 13). If that variant is ever
// removed, this component will fail to compile — intentional fail-loud.
// ============================================================================

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ReviewSuggestedBadgeProps = {
  onClick?: () => void;
  className?: string;
  /** Optional override for the visible label. Default: "Review suggested". */
  label?: string;
};

export function ReviewSuggestedBadge({
  onClick,
  className,
  label = "Review suggested",
}: ReviewSuggestedBadgeProps) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label="Why was review suggested?"
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
