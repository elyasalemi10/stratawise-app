"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { brandDomain } from "@/lib/manager-username";
import { getTeamMembers } from "@/lib/actions/team";

// Settings is eight routes now, not one page with tabs, so there is no
// aggregate fetch any more , each section asks for exactly what it renders.
// Opening /settings/profile used to pull team members, gmail subscriptions
// and the whole opt-out audit log before it could show you your own name.
//
// Every one of these is called from a client component through
// useCachedData, not from the page: a fetch in page.tsx runs once on the
// server and then again on every arrival, so returning to a section you were
// on ten seconds ago cost a full round trip and showed a skeleton for it.

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

export async function getNotificationSettings(): Promise<{
  currentPreferences: NotificationPrefRow[];
  autoOptOuts: AutoOptOutEntry[];
}> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  const supabase = createServerClient();

  const [prefsResult, optOutAuditsResult] = await Promise.all([
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

  // Most-recent-per-(type, channel) dedup. Lifetime auto-opt-outs per profile
  // are bounded by 13 types x 2 channels = 26 rows, so a linear scan is fine.
  const seen = new Map<string, AutoOptOutEntry>();
  for (const r of optOutAuditsResult.data ?? []) {
    const meta = (r as { metadata: { notification_type?: string; channel?: string } }).metadata;
    const t = meta.notification_type;
    const c = meta.channel;
    if (!t || !c || (c !== "email" && c !== "in_app")) continue;
    const key = `${t}:${c}`;
    if (!seen.has(key)) {
      seen.set(key, { type: t, channel: c, occurredAt: (r as { created_at: string }).created_at });
    }
  }

  return {
    currentPreferences: (prefsResult.data ?? []) as NotificationPrefRow[],
    autoOptOuts: Array.from(seen.values()),
  };
}

export async function getEmailSettings() {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  const supabase = createServerClient();

  const [mailProviderResult, mailboxSubResult, managerUsernameResult] = await Promise.all([
    profile.management_company_id
      ? supabase
          .from("management_companies")
          .select("mail_provider, mail_provider_config, mail_provider_configured_at")
          .eq("id", profile.management_company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("gmail_mailbox_subscriptions")
      .select("mailbox_email, last_error")
      .eq("manager_profile_id", profile.id)
      .maybeSingle(),
    supabase.from("profiles").select("email_username").eq("id", profile.id).maybeSingle(),
  ]);

  const mailRow = (mailProviderResult.data ?? null) as {
    mail_provider: "stratawise" | "gmail";
    mail_provider_config: { domain?: string } | null;
    mail_provider_configured_at: string | null;
  } | null;

  const subRow =
    (mailboxSubResult.data as { mailbox_email: string | null; last_error: string | null } | null) ??
    null;

  // Auth-shaped errors persisted by the gmail-push webhook or the sweep mean
  // the Workspace admin revoked our domain-wide delegation entry. Surfacing a
  // banner is the only way the manager finds out before mail goes quiet.
  const dwdRevoked =
    !!subRow?.last_error && /unauthorized|invalid_grant|forbidden|401|403/i.test(subRow.last_error);

  const managerUsername =
    (managerUsernameResult.data as { email_username: string | null } | null)?.email_username ?? null;

  return {
    mailProvider: {
      provider: mailRow?.mail_provider ?? ("stratawise" as const),
      domain: mailRow?.mail_provider_config?.domain ?? null,
      configured_at: mailRow?.mail_provider_configured_at ?? null,
    },
    // The GCP service-account Client ID customers paste into their Google
    // Workspace admin. Null when Gmail integration is not configured.
    gmailOauthClientId: process.env.GMAIL_OAUTH_CLIENT_ID ?? null,
    initialMailboxPrefix: subRow?.mailbox_email?.split("@")[0] ?? "",
    stratawiseFallbackEmail: managerUsername
      ? `${managerUsername}@${brandDomain()}`
      : `noreply@${brandDomain()}`,
    dwdRevoked,
    mailboxIntegrationError: subRow?.last_error ?? null,
  };
}


// ─── Per-section fetchers for the client cache ──────────────────────────────

export interface ProfileSettings {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export async function getProfileSettings(): Promise<ProfileSettings> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  return {
    id: profile.id,
    email: profile.email ?? null,
    first_name: profile.first_name ?? null,
    last_name: profile.last_name ?? null,
    avatar_url: profile.avatar_url ?? null,
  };
}

export interface TeamSettings {
  members: Awaited<ReturnType<typeof getTeamMembers>>;
  currentUserId: string;
  isAdmin: boolean;
}

export async function getTeamSettings(): Promise<TeamSettings> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  return {
    members: await getTeamMembers(),
    currentUserId: profile.id,
    isAdmin: profile.company_role === "admin",
  };
}
