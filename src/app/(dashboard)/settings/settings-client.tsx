"use client";

import { useCachedData } from "@/lib/use-cached-data";
import { SettingsTabs } from "./settings-tabs";
import { getSettingsPageData, type SettingsPageData } from "./data";
import { SettingsSkeleton } from "./settings-skeleton";

// One cache entry for the whole settings page, not one per tab. The tab
// lives in ?tab= and every tab is already rendered (inactive ones are
// CSS-hidden), so switching tabs neither re-fetches nor re-raises the bar.

export function SettingsClient() {
  const { data, loading } = useCachedData<SettingsPageData>("settings", getSettingsPageData);

  if (loading || !data) return <SettingsSkeleton />;

  return (
    <SettingsTabs
      profile={data.profile}
      company={data.company}
      teamMembers={data.teamMembers}
      currentPreferences={data.currentPreferences}
      autoOptOuts={data.autoOptOuts}
      mailProvider={data.mailProvider}
      gmailOauthClientId={data.gmailOauthClientId}
      initialMailboxPrefix={data.initialMailboxPrefix}
      stratawiseFallbackEmail={data.stratawiseFallbackEmail}
      dwdRevoked={data.dwdRevoked}
      mailboxIntegrationError={data.mailboxIntegrationError}
    />
  );
}
