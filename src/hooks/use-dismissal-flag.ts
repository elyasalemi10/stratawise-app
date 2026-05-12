"use client";

// ============================================================================
// useDismissalFlag — localStorage TTL'd dismissal flags
// ----------------------------------------------------------------------------
// Backs the "Not now" affordance on prompts that should reappear after a
// cooldown (e.g. the repeat-manual proposal toast: dismissed for 30 days per
// (oc, canonical_name, lot) tuple).
//
// All flags share a single localStorage entry "stratawise:dismissals" mapping
// arbitrary string keys → epoch-ms of dismissal. Garbage-collected on read:
// any entry older than `ttlMs` is dropped. Quota errors are silently
// swallowed — dismissal is a UX nice-to-have, never a correctness signal.
//
// SSR-safe via useSyncExternalStore. The server snapshot returns `false`,
// matching the initial client snapshot before any hydration mismatch can
// occur. In-tab mutations notify subscribers via a module-local listener
// bus; cross-tab updates flow through the native `storage` event.
// ============================================================================

import { useCallback, useSyncExternalStore } from "react";

type DismissalMap = Record<string, number>;

const STORAGE_KEY = "stratawise:dismissals";

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  for (const listener of listeners) listener();
}

function subscribe(callback: Listener): () => void {
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", callback);
    }
  };
}

function readMap(): DismissalMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as DismissalMap)
      : {};
  } catch {
    return {};
  }
}

function writeMap(map: DismissalMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled — ignore.
  }
}

function gc(map: DismissalMap, ttlMs: number): DismissalMap {
  const now = Date.now();
  const out: DismissalMap = {};
  for (const [k, ts] of Object.entries(map)) {
    if (typeof ts === "number" && now - ts < ttlMs) {
      out[k] = ts;
    }
  }
  return out;
}

const SERVER_SNAPSHOT = false;

export function useDismissalFlag(
  key: string,
  ttlMs: number,
): { dismissed: boolean; dismiss: () => void; reset: () => void } {
  const getSnapshot = useCallback(() => {
    if (!key) return false;
    const map = readMap();
    const ts = map[key];
    return typeof ts === "number" && Date.now() - ts < ttlMs;
  }, [key, ttlMs]);

  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT,
  );

  const dismiss = useCallback(() => {
    if (!key) return;
    const map = gc(readMap(), ttlMs);
    map[key] = Date.now();
    writeMap(map);
    notifyListeners();
  }, [key, ttlMs]);

  const reset = useCallback(() => {
    if (!key) return;
    const map = readMap();
    delete map[key];
    writeMap(map);
    notifyListeners();
  }, [key]);

  return { dismissed, dismiss, reset };
}
