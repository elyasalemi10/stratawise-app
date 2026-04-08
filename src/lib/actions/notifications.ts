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
  subdivision_id: string | null;
}

export async function getNotifications(limit = 20): Promise<Notification[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = createServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

export async function getUnreadCount(): Promise<number> {
  const profile = await getCurrentProfile();
  if (!profile) return 0;

  const supabase = createServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", profile.id)
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
    .eq("recipient_id", profile.id);
}

export async function markAllAsRead() {
  const profile = await getCurrentProfile();
  if (!profile) return;

  const supabase = createServerClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profile.id)
    .is("read_at", null);
}

// ─── Create notifications (called from other server actions) ──

export async function createNotification(params: {
  recipientId: string;
  subdivisionId?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const supabase = createServerClient();
  await supabase.from("notifications").insert({
    recipient_id: params.recipientId,
    subdivision_id: params.subdivisionId ?? null,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link ?? null,
  });
}

// Notify all lot owners in a subdivision
export async function notifySubdivisionLotOwners(params: {
  subdivisionId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  const supabase = createServerClient();

  const { data: members } = await supabase
    .from("subdivision_members")
    .select("profile_id")
    .eq("subdivision_id", params.subdivisionId)
    .eq("role", "lot_owner")
    .is("left_at", null);

  if (!members || members.length === 0) return;

  const inserts = members.map((m) => ({
    recipient_id: m.profile_id,
    subdivision_id: params.subdivisionId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link ?? null,
  }));

  await supabase.from("notifications").insert(inserts);
}
