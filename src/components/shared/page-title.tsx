"use client";

import { useRouteOC } from "@/lib/oc-id-map";

// The page's own heading, naming the OC it belongs to.
//
// The breadcrumb says "Documents". It does not say WHOSE, and a manager with
// eleven buildings open across tabs is answering that question constantly.
// "Parkinson's Documents" is a different sentence from "Documents", so this
// is not the duplicate H1 the design rules warn about: it carries the
// entity-specific context the breadcrumb cannot.
//
// The nickname comes from the module-scope OC map the sidebar populates, so
// this costs no fetch and renders on the first frame, including inside a
// loading boundary.

/** "Parkinson's" / "Jones'". A name already ending in s takes the bare
 *  apostrophe, because "Jones's Documents" is the kind of thing people
 *  notice and nobody enjoys. */
export function possessive(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

export function ocPageTitle(ocName: string | null | undefined, page: string): string {
  const nickname = (ocName ?? "").trim();
  // "OC" is the placeholder the id map falls back to when it has no name,
  // so it is not a nickname and must not be possessed.
  if (!nickname || nickname === "OC") return `OC ${page}`;
  return `${possessive(nickname)} ${page}`;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{children}</h1>
  );
}

/** Heading for a page inside an OC. Falls back to "OC <page>" when this tab
 *  has not seen the OC yet, which is the same moment its data is uncached. */
export function OCPageTitle({ page }: { page: string }) {
  const oc = useRouteOC();
  return <PageTitle>{ocPageTitle(oc?.name, page)}</PageTitle>;
}
