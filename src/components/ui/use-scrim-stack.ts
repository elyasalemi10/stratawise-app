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

/** True when this scrim is the topmost one currently mounted. */
export function useIsTopScrim(): boolean {
  const [id] = React.useState(() => nextId++);

  React.useEffect(() => {
    stack = [...stack, id];
    emit();
    return () => {
      stack = stack.filter((x) => x !== id);
      emit();
    };
  }, [id]);

  const topId = React.useSyncExternalStore(subscribe, getTopId, () => 0);

  // Before the registering effect runs, the very first scrim would read as
  // "not top" and flash transparent for a frame. An unregistered scrim with
  // nothing else open is the top one.
  return topId === id || (topId === 0 && stack.length === 0);
}
