"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { SecurityTab } from "./security-tab";
import { NotificationsTab } from "./notifications-tab";
import { CompanyTab } from "./company-tab";
import { TeamTab } from "./team-tab";
import type { Profile } from "@/lib/auth";
import type { TeamMember } from "@/lib/actions/team";
import type { NotificationPrefRow, AutoOptOutEntry } from "./page";

interface CompanyData {
  id: string;
  name: string;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  registered_name: string | null;
  signature_url: string | null;
}

function TabsInner({
  profile,
  company,
  teamMembers,
  currentPreferences,
  autoOptOuts,
}: {
  profile: Profile;
  company: CompanyData | null;
  teamMembers: TeamMember[];
  currentPreferences: NotificationPrefRow[];
  autoOptOuts: AutoOptOutEntry[];
}) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  const isManager = profile.role === "strata_manager" || profile.role === "super_admin";
  const isAdmin = profile.company_role === "admin";

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `/settings?tab=${value}`);
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {isManager && <TabsTrigger value="company">Company</TabsTrigger>}
          {isManager && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6">
        <div className={activeTab === "profile" ? "" : "hidden"}>
          <ProfileTab profile={profile} />
        </div>
        {isManager && (
          <div className={activeTab === "company" ? "" : "hidden"}>
            <CompanyTab company={company} />
          </div>
        )}
        {isManager && (
          <div className={activeTab === "team" ? "" : "hidden"}>
            <TeamTab
              members={teamMembers}
              currentUserId={profile.id}
              isAdmin={isAdmin}
            />
          </div>
        )}
        <div className={activeTab === "security" ? "" : "hidden"}>
          <SecurityTab />
        </div>
        <div className={activeTab === "notifications" ? "" : "hidden"}>
          <NotificationsTab
            currentPreferences={currentPreferences}
            autoOptOuts={autoOptOuts}
          />
        </div>
      </div>
    </div>
  );
}

export function SettingsTabs({
  profile,
  company,
  teamMembers,
  currentPreferences,
  autoOptOuts,
}: {
  profile: Profile;
  company: CompanyData | null;
  teamMembers: TeamMember[];
  currentPreferences: NotificationPrefRow[];
  autoOptOuts: AutoOptOutEntry[];
}) {
  return (
    <Suspense>
      <TabsInner
        profile={profile}
        company={company}
        teamMembers={teamMembers}
        currentPreferences={currentPreferences}
        autoOptOuts={autoOptOuts}
      />
    </Suspense>
  );
}
