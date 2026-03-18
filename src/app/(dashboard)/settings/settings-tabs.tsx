"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { SecurityTab } from "./security-tab";
import { NotificationsTab } from "./notifications-tab";
import type { Profile } from "@/lib/auth";

function TabsInner({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "profile";

  function onTabChange(value: string) {
    router.replace(`/settings?tab=${value}`, { scroll: false });
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* All tabs rendered, hidden via CSS — no loading delay */}
      <div className="mt-6">
        <div className={activeTab === "profile" ? "" : "hidden"}>
          <ProfileTab profile={profile} />
        </div>
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

export function SettingsTabs({ profile }: { profile: Profile }) {
  return (
    <Suspense>
      <TabsInner profile={profile} />
    </Suspense>
  );
}
