"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, Building2, Mail, Repeat, ShieldCheck, User, Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileTab } from "./profile-tab";
import { SecurityTab } from "./security-tab";
import { NotificationsTab } from "./notifications-tab";
import { CompanyTab } from "./company-tab";
import { TeamTab } from "./team-tab";
import { EmailTab, type MailProviderConfig } from "./email-tab";
import { FollowupTab } from "./followup-tab";
import type { Profile } from "@/lib/auth";
import type { TeamMember } from "@/lib/actions/team";
import type { NotificationPrefRow, AutoOptOutEntry } from "./data";

interface CompanyData {
  id: string;
  name: string;
  trading_as: string | null;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  registered_name: string | null;
  signature_url: string | null;
  brand_color: string | null;
  brand_color_secondary: string | null;
}

function TabsInner({
  profile,
  company,
  teamMembers,
  currentPreferences,
  autoOptOuts,
  mailProvider,
  gmailOauthClientId,
  initialMailboxPrefix,
  stratawiseFallbackEmail,
  dwdRevoked,
  mailboxIntegrationError,
}: {
  profile: Profile;
  company: CompanyData | null;
  teamMembers: TeamMember[];
  currentPreferences: NotificationPrefRow[];
  autoOptOuts: AutoOptOutEntry[];
  mailProvider: MailProviderConfig;
  gmailOauthClientId: string | null;
  initialMailboxPrefix: string;
  stratawiseFallbackEmail: string;
  dwdRevoked: boolean;
  mailboxIntegrationError: string | null;
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

  // Two groups, because these are two different things.
  //
  // A horizontal tab strip says "seven peers, pick one", which is wrong here:
  // Profile / Security / Notifications are about YOU and follow you between
  // firms, while Company / Team / Levy follow-up / Email are the workspace
  // and change when you switch firms. A strip also runs out of room, which is
  // why "Levy follow-up" was already the widest thing on the page.
  //
  // A left rail groups them, has room for the labels, and leaves the panel
  // beside it a fixed width so the content does not reflow as you move
  // between sections.

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <nav className="shrink-0 lg:w-56">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.managerOnly || isManager);
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="px-2 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => onTabChange(item.value)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-muted font-medium text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
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
        {isManager && (
          <div className={activeTab === "followup" ? "" : "hidden"}>
            <FollowupTab />
          </div>
        )}
        {isManager && (
          <div className={activeTab === "email" ? "" : "hidden"}>
            <EmailTab
              initial={mailProvider}
              oauthClientId={gmailOauthClientId}
              initialMailboxPrefix={initialMailboxPrefix}
              stratawiseFallbackEmail={stratawiseFallbackEmail}
              dwdRevoked={dwdRevoked}
              mailboxIntegrationError={mailboxIntegrationError}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ value: string; label: string; icon: LucideIcon; managerOnly?: boolean }>;
}> = [
  {
    // Follows the person. Same wherever they work.
    label: "Account",
    items: [
      { value: "profile", label: "Profile", icon: User },
      { value: "security", label: "Security", icon: ShieldCheck },
      { value: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    // Belongs to the firm. Changes when they switch firms.
    label: "Workspace",
    items: [
      { value: "company", label: "Company", icon: Building2, managerOnly: true },
      { value: "team", label: "Team", icon: Users, managerOnly: true },
      { value: "email", label: "Email", icon: Mail, managerOnly: true },
      { value: "followup", label: "Levy follow-up", icon: Repeat, managerOnly: true },
    ],
  },
];

export function SettingsTabs({
  profile,
  company,
  teamMembers,
  currentPreferences,
  autoOptOuts,
  mailProvider,
  gmailOauthClientId,
  initialMailboxPrefix,
  stratawiseFallbackEmail,
  dwdRevoked,
  mailboxIntegrationError,
}: {
  profile: Profile;
  company: CompanyData | null;
  teamMembers: TeamMember[];
  currentPreferences: NotificationPrefRow[];
  autoOptOuts: AutoOptOutEntry[];
  mailProvider: MailProviderConfig;
  gmailOauthClientId: string | null;
  initialMailboxPrefix: string;
  stratawiseFallbackEmail: string;
  dwdRevoked: boolean;
  mailboxIntegrationError: string | null;
}) {
  return (
    <Suspense>
      <TabsInner
        profile={profile}
        company={company}
        teamMembers={teamMembers}
        currentPreferences={currentPreferences}
        autoOptOuts={autoOptOuts}
        mailProvider={mailProvider}
        gmailOauthClientId={gmailOauthClientId}
        initialMailboxPrefix={initialMailboxPrefix}
        stratawiseFallbackEmail={stratawiseFallbackEmail}
        dwdRevoked={dwdRevoked}
        mailboxIntegrationError={mailboxIntegrationError}
      />
    </Suspense>
  );
}
