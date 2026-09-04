"use client";

import { useCachedData } from "@/lib/use-cached-data";
import {
  getProfileSettings, getTeamSettings, getNotificationSettings, getEmailSettings,
  type ProfileSettings, type TeamSettings,
} from "./data";
import { getCompanyData } from "./actions";
import { ProfileTab } from "./profile-tab";
import { TeamTab } from "./team-tab";
import { CompanyTab } from "./company-tab";
import { EmailTab } from "./email-tab";
import { NotificationsTab } from "./notifications-tab";
import {
  ProfileSkeleton, TeamSkeleton, CompanySkeleton, EmailSkeleton,
} from "./settings-skeletons";
import { NotificationsSkeleton } from "./notifications-skeleton";

// Every settings section fetches from the client, through the tab cache.
//
// They used to fetch in page.tsx. That runs on the server on every arrival,
// so coming back to a section you were reading ten seconds ago cost a full
// round trip and a skeleton to cover it , and because /settings is listed in
// CLIENT_CACHED_ROUTES, the router fallback did not revalidate them either.
// The worst of both: nothing cached, nothing refreshed, no bar.

export function ProfileSection() {
  const { data, loading } = useCachedData<ProfileSettings>("settings:profile", getProfileSettings);
  if (loading || !data) return <ProfileSkeleton />;
  return <ProfileTab profile={data} />;
}

export function TeamSection() {
  const { data, loading } = useCachedData<TeamSettings>("settings:team", getTeamSettings);
  if (loading || !data) return <TeamSkeleton />;
  return (
    <TeamTab
      members={data.members}
      currentUserId={data.currentUserId}
      isAdmin={data.isAdmin}
    />
  );
}

export function CompanySection() {
  const { data, loading } = useCachedData<Awaited<ReturnType<typeof getCompanyData>>>(
    "settings:company",
    getCompanyData,
  );
  if (loading || !data) return <CompanySkeleton />;
  return <CompanyTab company={data} />;
}

export function EmailSection() {
  const { data, loading } = useCachedData<Awaited<ReturnType<typeof getEmailSettings>>>(
    "settings:email",
    getEmailSettings,
  );
  if (loading || !data) return <EmailSkeleton />;
  return (
    <EmailTab
      initial={data.mailProvider}
      oauthClientId={data.gmailOauthClientId}
      initialMailboxPrefix={data.initialMailboxPrefix}
      stratawiseFallbackEmail={data.stratawiseFallbackEmail}
      dwdRevoked={data.dwdRevoked}
      mailboxIntegrationError={data.mailboxIntegrationError}
    />
  );
}

export function NotificationsSection() {
  const { data, loading } = useCachedData<Awaited<ReturnType<typeof getNotificationSettings>>>(
    "settings:notifications",
    getNotificationSettings,
  );
  if (loading || !data) return <NotificationsSkeleton />;
  return (
    <NotificationsTab
      currentPreferences={data.currentPreferences}
      autoOptOuts={data.autoOptOuts}
      role={data.role}
    />
  );
}
