"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  createMeetingSchema,
  type CreateMeetingInput,
  type MeetingRecord,
} from "@/lib/validations/meetings";

// ─── listMeetings ───────────────────────────────────────────────
export async function listMeetings(ocId: string): Promise<MeetingRecord[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, oc_id, reference_number, meeting_type, title, date_time, location, virtual_meeting_link, status, notice_sent_at, created_at",
    )
    .eq("oc_id", ocId)
    .order("date_time", { ascending: false });

  if (error) throw new Error(`Failed to load meetings: ${error.message}`);
  return (data ?? []) as MeetingRecord[];
}

// ─── createMeeting ──────────────────────────────────────────────
export async function createMeeting(
  input: CreateMeetingInput,
): Promise<{ meetingId?: string; error?: string }> {
  const parsed = createMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const profile = await requireCompanyRole(["admin", "manager"]);
  await requireOCAccess(parsed.data.oc_id);
  const supabase = createServerClient();

  // Operational reference (SW-MTG-YYYY-NNNNNN); oc_id arg ignored for MTG.
  const { data: refData } = await supabase.rpc("next_reference_number", {
    p_prefix: "MTG",
  });

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      oc_id: parsed.data.oc_id,
      reference_number: (refData as string | null) ?? null,
      meeting_type: parsed.data.meeting_type,
      title: parsed.data.title,
      date_time: parsed.data.date_time,
      location: parsed.data.location?.trim() || null,
      virtual_meeting_link: parsed.data.virtual_meeting_link?.trim() || null,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to create meeting" };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: parsed.data.oc_id,
    action: "meeting.created",
    entity_type: "meeting",
    entity_id: data.id,
    after_state: {
      meeting_type: parsed.data.meeting_type,
      title: parsed.data.title,
      date_time: parsed.data.date_time,
    },
  });

  revalidatePath("/ocs/[ocCode]/meetings", "page");
  return { meetingId: data.id };
}

// ─── cancelMeeting ──────────────────────────────────────────────
export async function cancelMeeting(
  meetingId: string,
): Promise<{ error?: string }> {
  const profile = await requireCompanyRole(["admin", "manager"]);
  const supabase = createServerClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, oc_id, status")
    .eq("id", meetingId)
    .single();
  if (!meeting) return { error: "Meeting not found" };
  await requireOCAccess(meeting.oc_id);

  const { error } = await supabase
    .from("meetings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: meeting.oc_id,
    action: "meeting.cancelled",
    entity_type: "meeting",
    entity_id: meetingId,
    before_state: { status: meeting.status },
    after_state: { status: "cancelled" },
  });

  revalidatePath("/ocs/[ocCode]/meetings", "page");
  return {};
}
