"use client";

import { cn } from "@/lib/utils";

// A slot whose height does not depend on which branch is showing.
//
// The problem it solves: a form that swaps one field for another based on an
// earlier answer changes height when you change that answer, and everything
// below it jumps , most visibly the footer buttons, which move out from
// under the cursor mid-click. Choosing "Online" instead of "In person" on the
// meeting form pushed the Back/Next row down by the difference between an
// address autocomplete and a single text input.
//
// Every case is stacked in the same grid cell, so the container is always as
// tall as the TALLEST case and the layout below it never moves. The inactive
// ones are invisible and `inert`, so they take no focus, no clicks, and are
// skipped by screen readers , they are holding space, not participating.
//
// Use this for any either/or field group. If the branches are wildly
// different in height the reserved space will look generous when the short
// one is showing; that is the correct trade against content that jumps.

export interface SwapCase {
  /** Stable key. */
  key: string;
  active: boolean;
  node: React.ReactNode;
}

export function SwapSlot({
  cases,
  className,
}: {
  cases: SwapCase[];
  className?: string;
}) {
  return (
    <div className={cn("grid", className)}>
      {cases.map((c) => (
        <div
          key={c.key}
          // Every case occupies the same cell.
          style={{ gridArea: "1 / 1" }}
          className={cn(!c.active && "invisible")}
          inert={!c.active}
          aria-hidden={!c.active || undefined}
        >
          {c.node}
        </div>
      ))}
    </div>
  );
}
