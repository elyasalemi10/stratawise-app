"use client";

import { SectionHeader } from "@/components/shared/section-header";
import { useRouteOC } from "@/lib/oc-id-map";
import { OCSettingsClient } from "../oc-settings-client";
import { OCSettingsSkeleton } from "../oc-settings-skeleton";
import { OC_SETTINGS_LABEL } from "../nav";

// Renders the REAL section, not a skeleton, whenever this tab already knows
// the OC.
//
// A loading.tsx is the only thing on screen while the server shell resolves
// the OC code, and a skeleton here overwrites content the tab already has:
// OCSettingsClient reads the client cache and paints the settings you were
// looking at a moment ago, but it never got the chance, because this
// boundary shimmered over the top of it first and then handed over.
//
// The one thing the boundary could not do for itself was turn the code in
// the URL into an id. The sidebar knows every OC the user can open, so it
// hands the pairs to a module-scope map and this reads them back. A miss
// means the first visit to that OC in this tab, which is exactly when there
// is no cached page data either, so the skeleton is the right answer. All
// six sections share one cache key, so switching between them costs nothing.
export default function Loading() {
  const oc = useRouteOC();
  return (
    <>
      <SectionHeader title={OC_SETTINGS_LABEL.management} />
      {oc ? (
        <OCSettingsClient ocId={oc.id} section="management" />
      ) : (
        <OCSettingsSkeleton section="management" />
      )}
    </>
  );
}
