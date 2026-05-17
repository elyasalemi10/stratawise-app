"use server";

import { getCurrentProfile } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  oc_id: string | null;
  // Free-form metadata. For email_reply we stash
  // { communication_log_id, sender_email } so the inbox detail view can
  // fetch the inbound email body without a second round-trip per row.
  metadata: Record<string, unknown> | null;
}

export async function getNotifications(limit = 20): Promise<Notification[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = createServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, read_at, created_at, oc_id, metadata")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Map DB column "body" to interface "message"
  return (data ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.body,
    link: n.link,
    read_at: n.read_at,
    created_at: n.created_at,
    oc_id: n.oc_id,
    metadata: (n.metadata as Record<string, unknown> | null) ?? null,
  }));
}

export async function getUnreadCount(): Promise<number> {
  const profile = await getCurrentProfile();
  if (!profile) return 0;

  const supabase = createServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .is("read_at", null);

  return count ?? 0;
}

export async function markAsRead(notificationId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const supabase = createServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("profile_id", profile.id);
}

export async function markAllAsRead() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const supabase = createServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("read_at", null);
}

// ─── Create notifications (called from other server actions) ──

export async function createNotification(params: {
  recipientId: string;
  ocId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const supabase = createServerClient();
  await supabase.from("notifications").insert({
    profile_id: params.recipientId,
    oc_id: params.ocId ?? null,
    type: params.type,
    title: params.title,
    body: params.message,
    link: params.link ?? null,
  });
}

// Notify all lot owners in a oc
export async function notifyOCLotOwners(params: {
  ocId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const supabase = createServerClient();

  const { data: members } = await supabase
    .from("oc_members")
    .select("profile_id")
    .eq("oc_id", params.ocId)
    .eq("role", "lot_owner")
    .is("left_at", null);

  if (!members || members.length === 0) return;

  const inserts = members.map((m) => ({
    profile_id: m.profile_id,
    oc_id: params.ocId,
    type: params.type,
    title: params.title,
    body: params.message,
    link: params.link ?? null,
  }));

  await supabase.from("notifications").insert(inserts);
}
