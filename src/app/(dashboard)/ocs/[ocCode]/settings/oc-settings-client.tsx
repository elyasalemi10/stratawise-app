"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { SettingsContent } from "./settings-content";
import { ManagementCard } from "./management-card";
import { getOCSettingsPageData, type OCSettingsPageData } from "./data";
import { OCSettingsSkeleton } from "./oc-settings-skeleton";

export function OCSettingsClient({ ocId }: { ocId: string }) {
  const fetcher = useCallback(() => getOCSettingsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<OCSettingsPageData>(
    `oc-settings:${ocId}`,
    fetcher,
  );

  if (loading || !data) return <OCSettingsSkeleton />;

  return (
    <div className="space-y-6">
      <ManagementCard
        ocId={ocId}
        currentCompanyId={data.ocMgmtCompanyId}
        agreement={data.agreement}
      />
      <SettingsContent
        oc={data.oc}
        autosend={data.autosend}
        autosendMailboxOptions={data.mailboxOptions}
        autosendBudgets={data.approvedBudgets}
        autosendPreloadedPeriods={data.preloadedPeriods}
      />
    </div>
  );
}
