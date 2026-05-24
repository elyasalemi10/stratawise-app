"use client";

// ============================================================================
// useMultiUrlState , multi-value URL search-param state, comma-delimited
// ----------------------------------------------------------------------------
// Reads `searchParams.get(key)`, splits on `,`, and returns a Set<T>. Setter
// writes back the comma-joined string (or removes the key entirely if empty).
// All other params on the URL are preserved verbatim.
//
// Mirrors the existing single-value pattern in
// reconciliation-queue-content.tsx (`router.replace` inside `startTransition`)
// so the queue page can mix this hook with its existing `updateFilter` calls
// without state desync.
// ============================================================================

import { useCallback, useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Options<T extends string> = {
  /** If provided, only these values survive parsing. Unknown values are
   *  dropped silently , useful when the URL is user-edited and the consumer
   *  only knows a closed set of valid values. */
  allowed?: ReadonlySet<T>;
};

export function useMultiUrlState<T extends string>(
  key: string,
  options: Options<T> = {},
): [Set<T>, (next: Set<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const allowed = options.allowed;

  const value = useMemo(() => {
    const raw = searchParams.get(key);
    if (!raw) return new Set<T>();
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as T[];
    if (!allowed) return new Set<T>(parts);
    return new Set<T>(parts.filter((p) => allowed.has(p)));
  }, [searchParams, key, allowed]);

  const setValue = useCallback(
    (next: Set<T>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.size === 0) {
        params.delete(key);
      } else {
        params.set(key, [...next].join(","));
      }
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [router, pathname, searchParams, key],
  );

  return [value, setValue];
}
