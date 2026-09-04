"use client";

import * as React from "react";

// Which scrim is on top.
//
// Two overlays open at once painted two 45% scrims over each other and the
// page went almost black , a drawer opened from a drawer looked like a
// different, heavier kind of modal rather than one more panel.
//
// This cannot be done in CSS. Base UI gives every overlay its OWN portal
// container appended to <body>, so two scrims are cousins, not siblings, and
// no combinator reaches from one to the other. A sibling selector silently
// matches nothing, which is exactly what the first attempt did.
//
// So the scrims tell each other. Each registers while mounted; only the last
// one registered paints. The rest go fully transparent , blur included,
// because two stacked blurs turn the page to soup.
//
// CLOSING COUNTS AS GONE. A closing overlay keeps its element around for the
// length of its exit animation, and while it was still holding the top of the
// stack the drawer underneath stayed transparent. So closing the second
// drawer read as: the scrim fades out with it, the page flashes light, then
// the first drawer's scrim snaps back on. The app knows there is another
// panel behind, so the backdrop should never have moved. Releasing the slot
// the moment the exit begins hands "top" straight to the drawer underneath,
// which is already painted, so the scrim holds steady and only the panel
// slides away.
//
// When the LAST overlay closes there is nothing underneath to take over, so
// the empty-stack case below keeps it painting and it fades out normally.

let stack: number[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTopId(): number {
  return stack.length > 0 ? stack[stack.length - 1] : 0;
}

/** Attributes Base UI stamps on an overlay while it is animating out. Sheets
 *  and dialogs use `data-ending-style`; popovers use `data-closed`. */
const CLOSING_ATTRS = ["data-ending-style", "data-closed"];

function isClosing(el: Element): boolean {
  return CLOSING_ATTRS.some((a) => el.hasAttribute(a));
}

/**
 * True when this scrim is the topmost one currently open.
 *
 * Attach the returned ref to the backdrop element: it is how the hook learns
 * that the overlay has started closing, which is earlier than unmounting and
 * is the moment the scrim below should take over.
 */
export function useIsTopScrim(): {
  isTop: boolean;
  ref: React.RefCallback<HTMLElement>;
} {
  const [id] = React.useState(() => nextId++);
  const releasedRef = React.useRef(false);

  const release = React.useCallback(() => {
    if (releasedRef.current) return;
    releasedRef.current = true;
    stack = stack.filter((x) => x !== id);
    emit();
  }, [id]);

  React.useEffect(() => {
    stack = [...stack, id];
    emit();
    return release;
  }, [id, release]);

  // Watch for the exit animation starting. An observer rather than a state
  // prop because the backdrop is rendered by Base UI's portal and never sees
  // the `open` flag its Root was given.
  const ref = React.useCallback<React.RefCallback<HTMLElement>>(
    (el) => {
      if (!el) return;
      if (isClosing(el)) {
        release();
        return;
      }
      const observer = new MutationObserver(() => {
        if (isClosing(el)) {
          release();
          observer.disconnect();
        }
      });
      observer.observe(el, { attributes: true, attributeFilter: CLOSING_ATTRS });
    },
    [release],
  );

  const topId = React.useSyncExternalStore(subscribe, getTopId, () => 0);

  // Before the registering effect runs, the very first scrim would read as
  // "not top" and flash transparent for a frame. An unregistered scrim with
  // nothing else open is the top one, which is also what keeps the last
  // overlay painting through its own exit animation.
  const isTop = topId === id || (topId === 0 && stack.length === 0);
  return { isTop, ref };
}
