import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getCompanyData } from "./actions";
import { getTeamMembers } from "@/lib/actions/team";
import { createServerClient } from "@/lib/supabase";
import { SettingsTabs } from "./settings-tabs";

export interface NotificationPrefRow {
  notification_type: string;
  channel: "email" | "in_app" | "sms" | "voice" | "letter";
  enabled: boolean;
}

export interface AutoOptOutEntry {
  type: string;
  channel: "email" | "in_app";
  occurredAt: string;
}

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  const isManager = profile.role === "strata_manager" || profile.role === "super_admin";
  const supabase = createServerClient();

  // PP6-D-B: server-fetch notification preferences + auto-opt-out
  // detection. Notifications tab receives both as props (settings-tabs
  // pattern: server component supplies, client tabs render).
  const [
    company,
    teamMembers,
    prefsResult,
    optOutAuditsResult,
  ] = await Promise.all([
    isManager ? getCompanyData() : Promise.resolve(null),
    isManager ? getTeamMembers() : Promise.resolve([]),
    supabase
      .from("notification_preferences")
      .select("notification_type, channel, enabled")
      .eq("profile_id", profile.id),
    supabase
      .from("audit_log")
      .select("metadata, created_at")
      .eq("profile_id", profile.id)
      .eq("action", "communication.opt_out_auto")
      .order("created_at", { ascending: false }),
  ]);

  const currentPreferences = (prefsResult.data ?? []) as NotificationPrefRow[];

  // Most-recent-per-(type, channel) dedup. Lifetime auto-opt-outs per
  // profile are bounded by 13 types × 2 channels = 26 rows, linear scan
  // is fine.
  const autoOptOutMap = new Map<string, AutoOptOutEntry>();
  for (const r of optOutAuditsResult.data ?? []) {
    const meta = (r as { metadata: { notification_type?: string; channel?: string } }).metadata;
    const t = meta.notification_type;
    const c = meta.channel;
    if (!t || !c || (c !== "email" && c !== "in_app")) continue;
    const key = `${t}:${c}`;
    if (!autoOptOutMap.has(key)) {
      autoOptOutMap.set(key, {
        type: t,
        channel: c,
        occurredAt: (r as { created_at: string }).created_at,
      });
    }
  }
  const autoOptOuts = Array.from(autoOptOutMap.values());

  return (
    <SettingsTabs
      profile={profile}
      company={company}
      teamMembers={teamMembers}
      currentPreferences={currentPreferences}
      autoOptOuts={autoOptOuts}
    />
  );
}
