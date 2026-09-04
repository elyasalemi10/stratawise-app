"use client";

import { useRouteOC } from "@/lib/oc-id-map";
import { InsuranceClient } from "./insurance-client";
import { InsuranceSkeleton } from "./insurance-skeleton";

// Renders the REAL page, not a skeleton, whenever this tab already knows the
// OC.
//
// A loading.tsx is the only thing on screen while the server shell resolves
// the OC code, and a skeleton here overwrites content the tab already has:
// InsuranceClient reads the client cache and paints the data you were looking at a
// moment ago, but it never got the chance, because this boundary shimmered
// over the top of it first and then handed over.
//
// The one thing the boundary could not do for itself was turn the code in
// the URL into an id. The sidebar knows every OC the user can open, so it
// hands the pairs to a module-scope map and this reads them back. A miss
// means the first visit to that OC in this tab, which is exactly when there
// is no cached page data either, so the skeleton is the right answer. The
// two mounts share one request (see use-cached-data).
export default function Loading() {
  const oc = useRouteOC();
  if (!oc) return <InsuranceSkeleton />;
  return <InsuranceClient ocId={oc.id} />;
}
