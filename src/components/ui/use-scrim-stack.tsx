"use client";

import * as React from "react";

// ============================================================================
// One scrim, for however many overlays are open.
// ----------------------------------------------------------------------------
// Two overlays open at once used to paint two 45% blacks over each other and
// the page went to roughly 70%: a drawer opened from a drawer looked like a
// different, heavier kind of modal rather than one more panel.
//
// The first attempt was a CSS sibling selector, which could never match:
// Base UI portals every overlay into its OWN container appended to <body>, so
// two scrims are cousins and no combinator reaches between them.
//
// The second attempt let the scrims tell each other who was on top and had
// the rest paint transparent. That fixed the doubling but made closing the
// top one a light-flash, because a closing overlay holds its element for the
// length of its exit animation and was still claiming the top spot. Trying to
// hand the spot over EARLY, by watching for the exit attribute, then meant
// there were moments with no scrim at all.
//
// Every version of that is the same mistake: the scrim is a property of "is
// anything open", and it was being attached to individual overlays, so it had
// to be moved between them. It is now ONE element, mounted once, painted
// whenever the stack is non-empty. Opening a second overlay changes nothing
// about it. Closing one changes nothing about it. Only going from none to one
// and one to none fades it, which is the only time the answer actually
// changes.
//
// The overlays keep their own backdrops, transparent, because those are what
// catch a click-outside to dismiss.
// ============================================================================

let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => openCount > 0;
const getServerSnapshot = () => false;

/**
 * Hold a slot while this overlay is showing. Call it from a backdrop; the
 * backdrop itself paints nothing.
 *
 * `active` exists because "mounted" and "showing" are not the same thing.
 * Base UI portals a Sheet or Dialog backdrop only while it is open, so those
 * can pass nothing. A component that renders itself all the time and decides
 * internally whether to show, like the document viewer, is mounted on every
 * visit to the page and dimmed the whole screen the moment it was added to
 * one. Anything holding the slot must be able to say when.
 */
export function useScrimSlot(active: boolean = true): void {
  React.useEffect(() => {
    if (!active) return;
    openCount += 1;
    emit();
    return () => {
      openCount = Math.max(0, openCount - 1);
      emit();
    };
  }, [active]);
}

/**
 * The scrim. Mounted once, near the root.
 *
 * pointer-events-none because dismissing is the overlay's own backdrop's job
 * and this must never sit between a click and it. aria-hidden because it is
 * decoration.
 */
export function ScrimLayer() {
  const active = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div
      aria-hidden
      data-scrim-layer=""
      className={[
        "pointer-events-none fixed inset-0 z-40 bg-black/45 backdrop-blur-sm",
        "transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        active ? "opacity-100" : "opacity-0",
        // Out of the layout entirely when nothing is open, so it cannot
        // intercept anything or affect scroll height between overlays.
        active ? "visible" : "invisible",
      ].join(" ")}
    />
  );
}
