"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProfileTab } from "./profile-tab";
import { SecurityTab } from "./security-tab";
import { NotificationsTab } from "./notifications-tab";
import type { Profile } from "@/lib/auth";

function TabsContent_({ profile }: { profile: Profile }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "profile";

  function onTabChange(value: string) {
    router.push(`/settings?tab=${value}`);
  }

  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>

      <div className="mt-6">
        <TabsContent value="profile">
          <ProfileTab profile={profile} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

export function SettingsTabs({ profile }: { profile: Profile }) {
  return (
    <Suspense>
      <TabsContent_ profile={profile} />
    </Suspense>
  );
}
