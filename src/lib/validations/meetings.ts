import { z } from "zod";

export const MEETING_TYPES = ["agm", "sgm"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  agm: "Annual General Meeting",
  sgm: "Special General Meeting",
};

export const MEETING_STATUSES = [
  "draft",
  "notice_sent",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

// Meeting format: in person (address in `location`) or online (link in
// `virtual_meeting_link`, detected platform in `online_platform`).
export const MEETING_FORMATS = ["in_person", "online"] as const;
export type MeetingFormat = (typeof MEETING_FORMATS)[number];

export const MEETING_PLATFORMS = ["google_meet", "zoom", "teams", "other"] as const;
export type MeetingPlatform = (typeof MEETING_PLATFORMS)[number];

export const MEETING_PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
  other: "Online meeting",
};

export const createMeetingSchema = z.object({
  oc_id: z.string().uuid(),
  meeting_type: z.enum(MEETING_TYPES),
  // Optional: blank defaults to the meeting-type label server-side.
  title: z.string().trim().max(200).nullable().optional(),
  // ISO timestamp built from the date + time pickers on the client.
  date_time: z.string().min(1, "Date and time are required"),
  meeting_format: z.enum(MEETING_FORMATS).default("in_person"),
  location: z.string().trim().max(300).nullable().optional(),
  virtual_meeting_link: z.string().trim().max(500).nullable().optional(),
  online_platform: z.enum(MEETING_PLATFORMS).nullable().optional(),
});

export type CreateMeetingInput = z.input<typeof createMeetingSchema>;

// ─── Agenda (create-meeting wizard, create-only) ────────────────────────────

export const agendaItemSchema = z.object({
  title: z.string().trim().min(1, "Each agenda item needs a title").max(300),
  motion: z.string().trim().max(2000).nullable().optional(),
});
export type AgendaItemInput = z.input<typeof agendaItemSchema>;

export const createMeetingWithNoticeSchema = createMeetingSchema.extend({
  agenda: z.array(agendaItemSchema).max(100).default([]),
});

export type CreateMeetingWithNoticeInput = z.input<typeof createMeetingWithNoticeSchema>;

// ─── Send notice (from the meeting detail page) ─────────────────────────────

export const MEETING_NOTIFY_SCOPES = ["all_owners", "specific"] as const;
export type MeetingNotifyScope = (typeof MEETING_NOTIFY_SCOPES)[number];

export const sendMeetingNoticeSchema = z.object({
  meeting_id: z.string().uuid(),
  notify_scope: z.enum(MEETING_NOTIFY_SCOPES).default("all_owners"),
  notify_lot_owner_ids: z.array(z.string().uuid()).default([]),
});
export type SendMeetingNoticeInput = z.input<typeof sendMeetingNoticeSchema>;

// Platform detection from a meeting URL host.
export function detectMeetingPlatform(url: string): MeetingPlatform {
  const u = url.toLowerCase();
  if (u.includes("meet.google.com")) return "google_meet";
  if (u.includes("zoom.us") || u.includes("zoom.com")) return "zoom";
  if (u.includes("teams.microsoft.com") || u.includes("teams.live.com")) return "teams";
  return "other";
}

export interface MeetingRecord {
  id: string;
  oc_id: string;
  reference_number: string | null;
  meeting_type: MeetingType;
  title: string;
  date_time: string;
  location: string | null;
  virtual_meeting_link: string | null;
  meeting_format: MeetingFormat | null;
  online_platform: MeetingPlatform | null;
  status: MeetingStatus;
  notice_sent_at: string | null;
  notice_pdf_url?: string | null;
  created_at: string;
}
