"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Skeletons paint IMMEDIATELY.
//
// This used to render nothing for the first 200ms so that a fast navigation
// skipped the skeleton instead of flashing one. That made sense when a
// skeleton was the only thing standing between you and the data. It stopped
// making sense once useCachedData arrived: `loading` is now true ONLY when
// there is no cached data at all, so the app already knows a real fetch is
// coming and a skeleton is always the right answer.
//
// The look is a sweep, not a pulse: a pulsing opacity reads as "something is
// broken and flashing", a highlight travelling left to right reads as
// loading. See .skeleton-shimmer in globals.css. bg-muted underneath is what
// shows when prefers-reduced-motion drops the gradient.

/** Must match the animation duration in .skeleton-shimmer. */
const SWEEP_MS = 750;

// ── Why this needs a ref at all ───────────────────────────────────────────
//
// A route renders its skeleton TWICE: once as the loading.tsx Suspense
// fallback while the server shell streams, then again from the client
// component once it mounts. Those are different React trees, so the fallback
// unmounts and new DOM nodes take its place , and a CSS animation on a new
// node starts from zero.
//
// What you saw was exactly that: the shine set off from the left, got a
// fraction of the way across, and snapped back to restart. Not a stutter in
// the animation, a second animation beginning.
//
// A negative animation-delay set from a shared clock fixes it. Every
// skeleton, whenever it mounts, joins the sweep already in progress rather
// than starting its own, so the handover between the two is invisible , and
// as a side effect every skeleton on a page moves in step instead of each
// running on its own offset.
//
// It runs in a ref callback rather than an effect so the phase is set before
// the browser paints, and it touches only style, so there is nothing for
// hydration to mismatch on.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  const syncPhase = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    node.style.setProperty(
      "--shimmer-delay",
      `-${(performance.now() % SWEEP_MS).toFixed(0)}ms`,
    );
  }, []);

  return (
    <div
      ref={syncPhase}
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
