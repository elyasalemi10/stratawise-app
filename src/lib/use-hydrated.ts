"use client";

import * as React from "react";

/** Never fires. The value only ever changes once, when React switches from
 *  the server snapshot to the client one, and that is not a subscription. */
const subscribe = () => () => {};

/**
 * False on the server and for the whole of hydration; true afterwards.
 *
 * For anything whose presence in the tree must not be decided by a value the
 * server and the client could disagree about. React guarantees the server
 * snapshot is used until hydration commits, so both sides render the same
 * thing, and the client-only branch appears one frame later.
 *
 * `useSyncExternalStore` rather than the usual `useState(false)` plus an
 * effect: same result, but it is not a state write in an effect, so it does
 * not cascade a second render pass through everything below it and does not
 * trip the lint rule that exists to stop exactly that.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
