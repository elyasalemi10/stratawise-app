"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { SettingsContent } from "./settings-content";
import { ManagementCard } from "./management-card";
import { getOCSettingsPageData, type OCSettingsPageData } from "./data";
import { OCSettingsSkeleton } from "./oc-settings-skeleton";
import type { OCSettingsSection } from "./nav";

// Every section shares ONE cache key, because they share one aggregate
// fetch. Moving between sections is therefore free: the data is already in
// the tab cache and the panel just re-renders a different slice of it.
export function OCSettingsClient({
  ocId,
  section,
}: {
  ocId: string;
  section: OCSettingsSection;
}) {
  const fetcher = useCallback(() => getOCSettingsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<OCSettingsPageData>(
    `oc-settings:${ocId}`,
    fetcher,
  );

  if (loading || !data) return <OCSettingsSkeleton section={section} />;

  if (section === "management") {
    return (
      <ManagementCard
        ocId={ocId}
        currentCompanyId={data.ocMgmtCompanyId}
        agreement={data.agreement}
      />
    );
  }

  return (
    <SettingsContent
      section={section}
      oc={data.oc}
      autosend={data.autosend}
      autosendMailboxOptions={data.mailboxOptions}
      autosendBudgets={data.approvedBudgets}
      autosendPreloadedPeriods={data.preloadedPeriods}
    />
  );
}
