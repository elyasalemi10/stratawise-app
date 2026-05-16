"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

// Lets a page override the URL-derived breadcrumb with custom labels (Item 4).
// Pages call `useSetBreadcrumb([...])` once they know the entity-specific labels
// (e.g. `Lot 12 · Unit 3A`). The header reads the override and falls back to
// pathname-derived crumbs if nothing is set (e.g. during loading.tsx).

export interface BreadcrumbCrumb {
  label: string;
  href?: string | null;
}

interface Ctx {
  override: BreadcrumbCrumb[] | null;
  setOverride: (c: BreadcrumbCrumb[] | null) => void;
}

const BreadcrumbContext = createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<BreadcrumbCrumb[] | null>(null);
  const value = useMemo(() => ({ override, setOverride }), [override]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useSetBreadcrumb(crumbs: BreadcrumbCrumb[] | null) {
  const ctx = useContext(BreadcrumbContext);
  // Stable string key for the effect dep — avoids re-running on identical arrays.
  const key = useMemo(() => (crumbs ? JSON.stringify(crumbs) : ""), [crumbs]);
  const ref = useRef(crumbs);
  ref.current = crumbs;

  useEffect(() => {
    if (!ctx) return;
    ctx.setOverride(ref.current);
    return () => {
      ctx.setOverride(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function useBreadcrumbOverride(): BreadcrumbCrumb[] | null {
  return useContext(BreadcrumbContext)?.override ?? null;
}
