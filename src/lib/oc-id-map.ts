"use client";

// ============================================================================
// short_code → oc id, client side.
// ----------------------------------------------------------------------------
// Every page under /ocs/[ocCode]/... needs the OC's UUID, and the only place
// that could turn the code into one was the server: each shell awaited
// resolveOCFromCode before it could render anything. That is fine for the
// page itself, but it made the ROUTE's loading.tsx the only thing on screen
// for the length of that round trip , and a loading.tsx can shimmer or it can
// be blank, it cannot show you the data you already have.
//
// The sidebar already knows the answer. It is handed every OC the user can
// open, `id` and `short_code` together, on the first dashboard render and
// again whenever its own cache refreshes. Keeping that pairing in module
// scope means a loading boundary can resolve the id itself and render the
// REAL client, which reads the tab cache and paints the content you were
// looking at a moment ago instead of a skeleton over the top of it.
//
// Miss = first visit to that OC in this tab, which is exactly the case where
// there is no cached page data either. Skeleton is the right answer there,
// and it is what the boundary falls back to.
// ============================================================================

import { useParams } from "next/navigation";

interface KnownOC {
  id: string;
  name: string;
}

const byCode = new Map<string, KnownOC>();

/** Record every code→OC pair we have been told about. Idempotent, so it is
 *  safe to call from a render body. */
export function rememberOCIds(
  ocs: ReadonlyArray<{ id: string; short_code: string | null; name?: string | null }>,
): void {
  for (const oc of ocs) {
    if (oc.short_code && oc.id) {
      byCode.set(oc.short_code, { id: oc.id, name: oc.name ?? "OC" });
    }
  }
}

export function recallOC(code: string | undefined): KnownOC | undefined {
  return code ? byCode.get(code) : undefined;
}

/** The OC for the route being rendered, or undefined if this tab has not
 *  seen that code yet. For use in a `loading.tsx`. */
export function useRouteOC(): KnownOC | undefined {
  const params = useParams<{ ocCode?: string }>();
  return recallOC(params?.ocCode);
}
