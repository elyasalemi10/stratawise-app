import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyIllustration, type IllustrationName } from "./empty-illustration";

// Standardised empty-state block. Used wherever a card/section/tab has
// nothing to show , guarantees a consistent visual (illustration → bold
// title → muted description → optional action) instead of every page
// inventing its own.
//
// Visual contract (locked in CLAUDE.md):
//   - illustration , one of the set in empty-illustration.tsx
//   - title , text-base font-semibold text-foreground
//   - body  , text-sm text-muted-foreground
//   - action , optional <Button> rendered below the body
//
// Use as a drop-in <Card>: `<EmptyState ... />`. Pass `card={false}` to
// render bare (for empty states inside an existing card or table cell).

interface EmptyStateProps {
  /** Which drawing to show. */
  illustration: IllustrationName;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** Wrap the block in a Card. Defaults to true. */
  card?: boolean;
  className?: string;
}

export function EmptyState({
  illustration,
  title,
  description,
  action,
  card = true,
  className,
}: EmptyStateProps) {
  const block = (
    <div
      className={`flex flex-col items-center gap-3 py-12 text-center ${className ?? ""}`}
    >
      <EmptyIllustration name={illustration} />
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );

  if (!card) return block;
  return (
    <Card>
      <CardContent>{block}</CardContent>
    </Card>
  );
}
