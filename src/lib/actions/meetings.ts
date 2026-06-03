"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import {
  createMeetingSchema,
  createMeetingWithNoticeSchema,
  sendMeetingNoticeSchema,
  MEETING_TYPE_LABELS,
  MEETING_PLATFORM_LABELS,
  detectMeetingPlatform,
  type MeetingPlatform,
  type CreateMeetingInput,
  type CreateMeetingWithNoticeInput,
  type SendMeetingNoticeInput,
  type MeetingRecord,
  type MeetingType,
} from "@/lib/validations/meetings";
import { generateAndUploadMeetingNotice, generateMeetingNoticeBuffer } from "@/lib/meeting-pdf";

// Detect the online platform from a meeting link. Unknown hosts (often short
// links like bit.ly / a tenant vanity URL) are followed once to their final
// URL and re-checked. Best-effort , falls back to "other".
async function resolveOnlinePlatform(link: string): Promise<string> {
  const direct = detectMeetingPlatform(link);
  if (direct !== "other") return direct;
  try {
    const url = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(4000) });
    return detectMeetingPlatform(res.url || link);
  } catch {
    return "other";
  }
}
import { runBulkEmail } from "@/lib/bulk-email-runner";
import type { MeetingNoticeProps } from "@/lib/pdf/types";
import { tasks } from "@trigger.dev/sdk";

// Builds the branded meeting-notice PDF props for an OC + parsed wizard input.
// Private helper shared by the create + preview actions.
async function buildMeetingNoticeProps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ocId: string,
  d: { meeting_type: string; title?: string | null; date_time: string; meeting_format?: string | null; location?: string | null; virtual_meeting_link?: string | null; online_platform?: string | null; agenda?: Array<{ title: string; motion?: string | null }> },
  reference: string,
): Promise<MeetingNoticeProps> {
  const [{ data: oc }, { count: lotCount }] = await Promise.all([
    supabase
      .from("owners_corporations")
      .select("name, plan_number, abn, address, suburb, state, postcode, management_companies(name, logo_url, brand_color, phone, email, abn)")
      .eq("id", ocId)
      .maybeSingle(),
    supabase.from("lots").select("id", { count: "exact", head: true }).eq("oc_id", ocId),
  ]);
  const mc = (oc as { management_companies: { name?: string; logo_url?: string | null; brand_color?: string | null; phone?: string | null; email?: string | null; abn?: string | null } | null } | null)?.management_companies ?? null;
  const ocAddress = [oc?.address, oc?.suburb, oc?.state, oc?.postcode].filter(Boolean).join(", ");
  const brand = mc?.brand_color || "#0E314C";
  const when = new Date(d.date_time);
  const whenLabel = when.toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
  const dateLabel = when.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeLabel = when.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  const agenda = (d.agenda ?? []).filter((a) => a.title.trim().length > 0);
  const typeLabel = MEETING_TYPE_LABELS[d.meeting_type as MeetingType];
  const isOnline = d.meeting_format === "online";
  const platformLabel = d.online_platform ? MEETING_PLATFORM_LABELS[d.online_platform as MeetingPlatform] : null;

  return {
    managementCompany: {
      name: mc?.name ?? "StrataWise",
      logo_url: mc?.logo_url ?? null,
      phone: mc?.phone ?? null,
      email: mc?.email ?? null,
      abn: mc?.abn ?? null,
    },
    oc: { name: oc?.name ?? "Owners Corporation", address: ocAddress, abn: oc?.abn ?? null, plan_number: oc?.plan_number ?? "" },
    documentTitle: "Meeting Notice",
    referenceNumber: reference,
    date: new Date(),
    meetingType: (d.meeting_type === "sgm" ? "sgm" : "agm"),
    meetingTypeLabel: typeLabel,
    meetingTitle: d.title?.trim() || typeLabel,
    whenLabel,
    dateLabel,
    timeLabel,
    format: isOnline ? "online" : "in_person",
    location: isOnline ? null : (d.location?.trim() || null),
    onlineLink: isOnline ? (d.virtual_meeting_link?.trim() || null) : null,
    onlinePlatformLabel: isOnline ? platformLabel : null,
    ocLotCount: lotCount ?? 0,
    agenda: agenda.map((a, i) => ({ position: i + 1, title: a.title.trim(), motion: a.motion?.trim() || null })),
    brandColors: { primary: brand, secondary: brand },
  };
}

// Renders a preview of the notice PDF without persisting anything. Returns a
// base64 data URL the client opens in a new tab from the wizard's review step.
export async function previewMeetingNotice(
  input: CreateMeetingWithNoticeInput,
): Promise<{ dataUrl?: string; error?: string }> {
  const parsed = createMeetingWithNoticeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await requireOCAccess(parsed.data.oc_id);
  const supabase = createServerClient();
  try {
    const props = await buildMeetingNoticeProps(supabase, parsed.data.oc_id, parsed.data, "PREVIEW");
    const buffer = await generateMeetingNoticeBuffer(props);
    return { dataUrl: `data:application/pdf;base64,${buffer.toString("base64")}` };
  } catch (err) {
    console.error("previewMeetingNotice failed", err);
    return { error: "Could not generate the preview. Try again." };
  }
}

// ─── listMeetings ───────────────────────────────────────────────
export async function listMeetings(ocId: string): Promise<MeetingRecord[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("meetings")
    .select(
      "id, oc_id, reference_number, meeting_type, title, date_time, location, virtual_meeting_link, meeting_format, online_platform, status, notice_sent_at, notice_pdf_url, created_at",
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

  // Clean, human-readable reference numbered GLOBALLY per type+year:
  // "{TYPE}-{YEAR}-{n}" where n is the platform-wide count of that meeting
  // type in that year + 1 (e.g. "AGM-2026-7" = the 7th AGM across all OCs in
  // 2026). Global numbering means an owner in two OCs never sees the same
  // code twice. Uniqueness is enforced by idx_meetings_reference_global.
  const typeCode = { agm: "AGM", sgm: "SGM" }[parsed.data.meeting_type];
  const year = new Date(parsed.data.date_time).getFullYear();
  const { count: existingCount } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("meeting_type", parsed.data.meeting_type)
    .gte("date_time", `${year}-01-01`)
    .lt("date_time", `${year + 1}-01-01`);
  const reference = `${typeCode}-${year}-${(existingCount ?? 0) + 1}`;

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      oc_id: parsed.data.oc_id,
      reference_number: reference,
      meeting_type: parsed.data.meeting_type,
      title: parsed.data.title?.trim() || MEETING_TYPE_LABELS[parsed.data.meeting_type],
      date_time: parsed.data.date_time,
      meeting_format: parsed.data.meeting_format ?? "in_person",
      location: parsed.data.location?.trim() || null,
      virtual_meeting_link: parsed.data.virtual_meeting_link?.trim() || null,
      online_platform: parsed.data.online_platform ?? null,
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

// ─── createMeetingWithNotice (wizard, create-only) ──────────────
// Inserts the meeting + agenda and renders the branded notice PDF (stored on
// the meeting). Sending happens later from the meeting detail page. Returns
// the meeting id; navigation happens client-side.
export async function createMeetingWithNotice(
  input: CreateMeetingWithNoticeInput,
): Promise<{ meetingId?: string; error?: string }> {
  const parsed = createMeetingWithNoticeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const title = d.title?.trim() || MEETING_TYPE_LABELS[d.meeting_type];

  const profile = await requireCompanyRole(["admin", "manager"]);
  await requireOCAccess(d.oc_id);
  const supabase = createServerClient();

  const typeCode = { agm: "AGM", sgm: "SGM" }[d.meeting_type];
  const year = new Date(d.date_time).getFullYear();
  const { count: existingCount } = await supabase
    .from("meetings")
    .select("id", { count: "exact", head: true })
    .eq("meeting_type", d.meeting_type)
    .gte("date_time", `${year}-01-01`)
    .lt("date_time", `${year + 1}-01-01`);
  const reference = `${typeCode}-${year}-${(existingCount ?? 0) + 1}`;

  const link = d.virtual_meeting_link?.trim() || null;
  const onlinePlatform = d.meeting_format === "online" && link ? await resolveOnlinePlatform(link) : null;

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      oc_id: d.oc_id,
      reference_number: reference,
      meeting_type: d.meeting_type,
      title,
      date_time: d.date_time,
      meeting_format: d.meeting_format ?? "in_person",
      location: d.meeting_format === "online" ? null : (d.location?.trim() || null),
      virtual_meeting_link: d.meeting_format === "online" ? link : null,
      online_platform: onlinePlatform,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !meeting) return { error: error?.message ?? "Failed to create meeting" };

  // Agenda items.
  const agenda = (d.agenda ?? []).filter((a) => a.title.trim().length > 0);
  if (agenda.length > 0) {
    await supabase.from("agenda_items").insert(
      agenda.map((a, i) => ({
        meeting_id: meeting.id,
        item_number: i + 1,
        title: a.title.trim(),
        motion_text: a.motion?.trim() || null,
        sort_order: i + 1,
      })),
    );
  }

  // Build + upload the branded notice PDF (ready to send from the detail page).
  try {
    const props = await buildMeetingNoticeProps(supabase, d.oc_id, { ...d, title }, reference);
    const key = await generateAndUploadMeetingNotice(props, d.oc_id, reference);
    await supabase.from("meetings").update({ notice_pdf_url: key }).eq("id", meeting.id);
  } catch (err) {
    console.error("createMeetingWithNotice: PDF generation failed", err);
    return { meetingId: meeting.id, error: "The meeting was created but the notice could not be generated. Try again from the meeting." };
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: d.oc_id,
    action: "meeting.created",
    entity_type: "meeting",
    entity_id: meeting.id,
    after_state: { meeting_type: d.meeting_type, title, date_time: d.date_time },
  });

  revalidatePath("/ocs/[ocCode]/meetings", "page");
  return { meetingId: meeting.id };
}

// ─── getMeetingDetail ───────────────────────────────────────────
export interface MeetingAgendaItem { id: string; position: number; title: string; motion: string | null }
export interface MeetingDetail extends MeetingRecord {
  agenda: MeetingAgendaItem[];
}

export async function getMeetingDetail(meetingId: string): Promise<MeetingDetail | null> {
  const supabase = createServerClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, oc_id, reference_number, meeting_type, title, date_time, location, virtual_meeting_link, meeting_format, online_platform, status, notice_sent_at, notice_pdf_url, created_at")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) return null;
  await requireOCAccess(meeting.oc_id as string);

  const { data: agendaRows } = await supabase
    .from("agenda_items")
    .select("id, item_number, title, motion_text")
    .eq("meeting_id", meetingId)
    .order("item_number", { ascending: true });

  const agenda: MeetingAgendaItem[] = (agendaRows ?? []).map((a) => ({
    id: a.id as string,
    position: a.item_number as number,
    title: a.title as string,
    motion: (a.motion_text as string) ?? null,
  }));

  return { ...(meeting as MeetingRecord), agenda };
}

// ─── sendMeetingNotice (from the detail page) ───────────────────
export async function sendMeetingNotice(
  input: SendMeetingNoticeInput,
): Promise<{ error?: string }> {
  const parsed = sendMeetingNoticeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const profile = await requireCompanyRole(["admin", "manager"]);
  const supabase = createServerClient();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, oc_id, notice_pdf_url")
    .eq("id", parsed.data.meeting_id)
    .maybeSingle();
  if (!meeting) return { error: "Meeting not found" };
  await requireOCAccess(meeting.oc_id as string);
  if (!meeting.notice_pdf_url) return { error: "The notice PDF isn't ready yet. Try again shortly." };

  const payload = {
    kind: "meeting_notice" as const,
    meetingId: meeting.id as string,
    notifyScope: parsed.data.notify_scope,
    lotOwnerIds: parsed.data.notify_scope === "specific" ? (parsed.data.notify_lot_owner_ids ?? []) : [],
  };
  if (process.env.TRIGGER_SECRET_KEY) {
    try {
      await tasks.trigger("send-bulk-email", payload);
    } catch (err) {
      console.error("sendMeetingNotice: failed to queue send-bulk-email, sending inline", err);
      await runBulkEmail(payload);
    }
  } else {
    await runBulkEmail(payload);
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: meeting.oc_id,
    action: "meeting.notice_sent",
    entity_type: "meeting",
    entity_id: meeting.id,
    after_state: { notify_scope: parsed.data.notify_scope },
  });

  revalidatePath("/ocs/[ocCode]/meetings", "page");
  return {};
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
