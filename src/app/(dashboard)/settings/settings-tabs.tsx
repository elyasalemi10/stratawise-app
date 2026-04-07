"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { SecurityTab } from "./security-tab";
import { NotificationsTab } from "./notifications-tab";
import { CompanyTab } from "./company-tab";
import type { Profile } from "@/lib/auth";

interface CompanyData {
  id: string;
  name: string;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

function TabsInner({ profile, company }: { profile: Profile; company: CompanyData | null }) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  const isManager = profile.role === "strata_manager" || profile.role === "super_admin";

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
        <div className={activeTab === "security" ? "" : "hidden"}>
          <SecurityTab />
        </div>
        <div className={activeTab === "notifications" ? "" : "hidden"}>
          <NotificationsTab />
        </div>
      </div>
    </div>
  );
}

export function SettingsTabs({ profile, company }: { profile: Profile; company: CompanyData | null }) {
  return (
    <Suspense>
      <TabsInner profile={profile} company={company} />
    </Suspense>
  );
}
