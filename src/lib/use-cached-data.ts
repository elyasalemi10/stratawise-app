"use client";

// ============================================================================
// Client data cache , the one you feel.
// ----------------------------------------------------------------------------
// A plain Map in module scope, keyed by a string you choose ("ocs",
// `lots:${ocId}`, `levies:${ocId}:${batchId}`).
//
// Lifetime is the tab. No TTL. It dies on a hard reload and nothing evicts it
// in between except the size cap. That is deliberate: this is a
// render-instantly cache, not a correctness cache. The freshness guarantee
// comes from the revalidation, not from an expiry.
//
// WHY THIS EXISTS AT ALL, given Next already has a Router Cache: because
// router.refresh() has no per-route granularity. It is the only way to
// re-fetch a server component route and it invalidates the cache for EVERY
// route, so refreshing /lots makes /dashboard cold. Measured: a revisit with
// no refresh in between costs 0 navigation fetches, the same revisit after a
// refresh costs 2. This cache is keyed per dataset, so refreshing
// `lots:${ocId}` touches nothing else. That is the whole point.
//
// THE RHYTHM
//   On arrival     render whatever is cached immediately, fetch behind it.
//                  This is the ONLY time the refresh bar shows.
//   Every 30s      silent re-fetch so an open tab does not drift.
//   Tab hidden     polling pauses, and fires immediately on becoming
//                  visible, so coming back lands on current data rather
//                  than waiting out the interval.
//   Overlapping    skipped. A slow fetch cannot stack up.
//   On failure     keep what is on screen. Blanking a page because one poll
//                  timed out is worse than data that is thirty seconds old.
//
// TWO THINGS THAT MATTER MORE THAN THEY LOOK
//   Local edits write through. setData updates the cache as well as the
//   screen, so an optimistic status change survives navigating away and back.
//
//   Optimistic edits block revalidation. While a write is in flight the
//   server's view is behind the screen's, so any refresh that lands is stale
//   by definition and gets thrown away. Without this, a poll overlapping a
//   delete returns the old list and the rows visibly come back until the next
//   poll removes them again.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { startRefreshing } from "@/components/layout/refresh-bar";

// ─── The cache ────────────────────────────────────────────────────────

interface CacheEntry {
  value: unknown;
  /** When this value came back from the server. Age is measured from HERE,
   *  not from when you left the page: once you navigate away the page's poll
   *  stops and the entry freezes, so "time since I left" would undercount
   *  how stale it actually is. */
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** A long session should not accumulate an entry per entity visited. Map
 *  iterates in insertion order, so dropping from the front sheds the
 *  oldest. Bounded because each entry can hold a full page payload. */
const MAX_CACHE_ENTRIES = 100;

function readCache(key: string): CacheEntry | undefined {
  return cache.get(key);
}

function writeCache<T>(key: string, value: T): void {
  cache.delete(key); // re-insert so recently used moves to the back
  cache.set(key, { value, fetchedAt: Date.now() });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Fetches in flight, keyed the same way as the cache.
 *
 *  Shared across hook instances rather than held per-instance, because a
 *  page is now mounted TWICE in quick succession on every navigation: once
 *  by the route's loading.tsx (which renders the real component so it can
 *  paint from the cache) and once for real when the server shell lands.
 *  Per-instance de-duplication cannot see across that handover, so both
 *  mounts fired the same request. Joining the promise means the second
 *  mount rides the first one's round trip.
 *
 *  The leader writes the cache whether or not it is still mounted, so a
 *  fetch started by the boundary is not thrown away when the boundary is
 *  replaced. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Drop every entry whose key starts with `prefix`. Call after a mutation
 * that invalidates more than the page you are on, e.g. after creating a lot:
 * `invalidateCached("lots:")`.
 */
export function invalidateCached(prefix: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Wipe everything. For sign-out , the next user must not see the last
 *  one's data sitting in a tab-lifetime cache. */
export function clearCachedData(): void {
  cache.clear();
  inFlight.clear();
}

/** Routes the router-based fallback must NOT refresh on arrival.
 *
 *  Two kinds qualify, and both want the same treatment:
 *    - pages served by this hook, which fetch for themselves
 *    - pages with nothing to revalidate: static copy, pure redirects, and
 *      forms that own their state client-side (a refresh under one throws
 *      the user's work away)
 *
 *  STATIC on purpose. This was a runtime Set that each hook registered into
 *  from an effect, which raced: <RefreshBar /> renders before {children} in
 *  the root layout, so StaleWhileRevalidate's arrival effect ran BEFORE the
 *  page's hook could register, fired router.refresh() anyway, and the page
 *  paid for both a router refresh and the hook's fetch. Both held the
 *  ref-counted bar, so the gold line outlived the data it was waiting on.
 *
 *  A pattern list has no ordering dependency and is greppable: when a page
 *  is converted to useCachedData, add its route here. */
const CLIENT_CACHED_ROUTES: RegExp[] = [
  // Firm-level
  /^\/dashboard$/,
  /^\/dashboard\/past-lots\/[^/]+$/,
  /^\/ocs$/,
  /^\/inbox$/,
  /^\/contractors$/,
  /^\/maintenance$/,
  /^\/levies$/,
  // Settings is seven routes now, each fetching only its own section, so
  // every one of them owns its loading state and none needs revalidating by
  // the router fallback.
  /^\/settings(\/[^/]+)?$/,
  // Static , nothing to fetch, so nothing to revalidate either. Listed so
  // the router fallback does not fire a pointless refresh on arrival.
  /^\/meetings$/,
  // Per-OC
  /^\/ocs\/[^/]+$/,
  /^\/ocs\/[^/]+\/lots$/,
  /^\/ocs\/[^/]+\/lots\/[^/]+$/,
  /^\/ocs\/[^/]+\/documents$/,
  /^\/ocs\/[^/]+\/levies$/,
  /^\/ocs\/[^/]+\/levies\/[^/]+$/,
  /^\/ocs\/[^/]+\/my-levies$/,
  /^\/ocs\/[^/]+\/budgets$/,
  /^\/ocs\/[^/]+\/budgets\/[^/]+$/,
  /^\/ocs\/[^/]+\/meetings$/,
  /^\/ocs\/[^/]+\/meetings\/[^/]+$/,
  /^\/ocs\/[^/]+\/insurance$/,
  /^\/ocs\/[^/]+\/maintenance$/,
  /^\/ocs\/[^/]+\/funds$/,
  /^\/ocs\/[^/]+\/bank-accounts$/,
  /^\/ocs\/[^/]+\/reports$/,
  /^\/ocs\/[^/]+\/rules$/,
  // OC settings is six section routes now, all sharing one aggregate fetch
  // and one cache key, so switching sections costs nothing.
  /^\/ocs\/[^/]+\/settings(\/[^/]+)?$/,
  // Forms, wizards and redirects. Nothing to revalidate, and a refresh under
  // a half-filled form is destructive. Two of these (budgets/create,
  // meetings/create) already fell under the detail-page patterns above by
  // accident; listed explicitly so the intent is legible.
  /^\/ocs\/[^/]+\/(budgets|funds|meetings)\/create$/,
  /^\/ocs\/[^/]+\/generate$/,
  /^\/ocs\/[^/]+\/manage$/,
  // Static help copy.
  /^\/help\//,
];

export function isClientCached(pathname: string): boolean {
  return CLIENT_CACHED_ROUTES.some((re) => re.test(pathname));
}

// ─── The hook ─────────────────────────────────────────────────────────

/** How often a page open in front of someone re-fetches itself. */
const AUTO_REFRESH_MS = 30_000;

export interface CachedData<T> {
  /** Cached value if there is one, otherwise undefined until the first
   *  fetch lands. */
  data: T | undefined;
  /** No cached data at all, first ever visit. THIS is what drives
   *  skeletons. Mutually exclusive with isEntering. */
  loading: boolean;
  /** Showing cached data while the arrival fetch checks it. THIS is what
   *  drives the refresh bar. Mutually exclusive with loading. */
  isEntering: boolean;
  /** Last fetch error. The data is left alone, so this is advisory. */
  error: string | null;
  /** Force a re-fetch. Silent by default. */
  refresh: (opts?: { showBar?: boolean }) => void;
  /** Optimistic update. Writes through to the cache so it survives
   *  navigating away and back. */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
  /** Wrap a write so revalidation is suppressed while the server is behind
   *  the screen. Always settles, so it is safe in a finally. */
  mutate: <R>(write: () => Promise<R>) => Promise<R>;
}

export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { autoRefresh?: boolean },
): CachedData<T> {
  const cached = readCache(key);
  const [data, setDataState] = useState<T | undefined>(cached?.value as T | undefined);
  const [loading, setLoading] = useState(cached === undefined);
  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  /** Non-zero while an optimistic write is in flight. Any fetch that lands
   *  in that window is stale by definition and is discarded. */
  const pendingWritesRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  const mountedRef = useRef(true);

  useEffect(() => {
    fetcherRef.current = fetcher;
    keyRef.current = key;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: "first" | "arrival" | "silent") => {
      if (inFlightRef.current) return; // one in flight is enough
      if (pendingWritesRef.current > 0) return; // screen is ahead of the server
      inFlightRef.current = true;
      const forKey = keyRef.current;
      if (mode === "arrival") setIsEntering(true);

      // Join a request already out for this key rather than starting a
      // second one. Only the instance that STARTED it clears the entry.
      let promise = inFlight.get(forKey) as Promise<T> | undefined;
      const isLeader = promise === undefined;
      if (promise === undefined) {
        promise = fetcherRef.current();
        inFlight.set(forKey, promise);
      }

      try {
        const next = await promise;
        // The leader caches unconditionally: it may have been unmounted by
        // the boundary handover, and dropping the result would waste the
        // round trip the next mount is about to repeat.
        if (isLeader && pendingWritesRef.current === 0) writeCache(forKey, next);
        // Discard if a write started while we were out, or the key moved on.
        if (pendingWritesRef.current > 0) return;
        if (!mountedRef.current || keyRef.current !== forKey) return;
        if (!isLeader) writeCache(forKey, next);
        setDataState(next);
        setError(null);
      } catch (err) {
        // Keep whatever is on screen. A failed poll must not blank the page.
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Couldn't refresh this page.");
        }
      } finally {
        if (isLeader) inFlight.delete(forKey);
        inFlightRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
          if (mode === "arrival") setIsEntering(false);
        }
      }
    },
    [],
  );

  // Arrival.
  //
  // No cache at all: skeletons, no bar. Nothing on screen to caveat.
  //
  // Cached: paint it immediately and ALWAYS re-fetch behind it, so what you
  // are looking at is never knowingly stale. Whether the BAR shows is a
  // separate question from whether the fetch happens:
  //
  //   younger than AUTO_REFRESH_MS  fetch silently. Had you stayed on the
  //                                 page, the poll would not have fired yet
  //                                 either, so there is nothing to announce
  //                                 and a bar on every hop is just noise.
  //   older                         fetch with the bar. The data predates
  //                                 the freshness the page would have had
  //                                 if you had stayed, which is exactly the
  //                                 thing the bar exists to say.
  //
  // Same constant on purpose: the promise is "never more than one poll
  // interval stale", whether you stayed or left and came back.
  useEffect(() => {
    const existing = readCache(key);
    if (existing !== undefined) {
      setDataState(existing.value as T);
      setLoading(false);
      const age = Date.now() - existing.fetchedAt;
      void run(age >= AUTO_REFRESH_MS ? "arrival" : "silent");
    } else {
      setLoading(true);
      void run("first");
    }
  }, [key, run]);

  // The bar is driven purely by isEntering, so a page cannot show a
  // skeleton and claim to be refreshing at the same time.
  useEffect(() => {
    if (!isEntering) return;
    return startRefreshing();
  }, [isEntering]);

  // Keep an open tab current. Silent: nobody asked for these.
  useEffect(() => {
    if (options?.autoRefresh === false) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return; // paused while hidden
      void run("silent");
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [run, options?.autoRefresh]);

  // Coming back to the tab fires immediately rather than waiting out the
  // interval, so attention always lands on current data.
  useEffect(() => {
    if (options?.autoRefresh === false) return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void run("silent");
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [run, options?.autoRefresh]);

  const refresh = useCallback(
    (opts?: { showBar?: boolean }) => {
      void run(opts?.showBar ? "arrival" : "silent");
    },
    [run],
  );

  const setData = useCallback((next: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => {
      const value = typeof next === "function" ? (next as (p: T | undefined) => T)(prev) : next;
      writeCache(keyRef.current, value); // write through, survives navigation
      return value;
    });
  }, []);

  const mutate = useCallback(async <R,>(write: () => Promise<R>): Promise<R> => {
    pendingWritesRef.current += 1;
    try {
      return await write();
    } finally {
      pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
    }
  }, []);

  return { data, loading, isEntering, error, refresh, setData, mutate };
}
