"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// The one way to explain a field.
//
// CLAUDE.md bans helper paragraphs under inputs: tooltip-grade copy sitting
// permanently on the page clutters every screen for the one person who
// needed it once. But some fields genuinely do need a sentence , a statutory
// term, a format that is not guessable, a number with a legal consequence.
//
// This is where that sentence goes. A question mark the reader can ignore
// entirely, next to the label, that says what it needs to say on hover or
// focus and then gets out of the way.
//
// It is keyboard reachable on purpose (a real <button>), because a tooltip
// only a mouse can open is a tooltip half the users cannot read.

export function InfoTooltip({
  children,
  label = "More information",
}: {
  /** The sentence. Keep it to one. */
  children: React.ReactNode;
  /** Screen-reader name for the trigger. Override when a generic "more
   *  information" would be ambiguous on a page with several. */
  label?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            // Not a <Button>: this sits inline against a <Label> and should
            // read as punctuation, not as an action competing with the form.
            className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        }
      >
        <HelpCircle className="size-3.5" aria-hidden />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{children}</p>
      </TooltipContent>
    </Tooltip>
  );
}
