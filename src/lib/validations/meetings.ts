import { z } from "zod";

export const MEETING_TYPES = ["agm", "sgm", "committee"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  agm: "Annual General Meeting",
  sgm: "Special General Meeting",
  committee: "Committee meeting",
};

export const MEETING_STATUSES = [
  "draft",
  "notice_sent",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const createMeetingSchema = z.object({
  oc_id: z.string().uuid(),
  meeting_type: z.enum(MEETING_TYPES),
  title: z.string().trim().min(1, "Title is required").max(200),
  // ISO timestamp built from the date + time pickers on the client.
  date_time: z.string().min(1, "Date and time are required"),
  location: z.string().trim().max(300).nullable().optional(),
  virtual_meeting_link: z.string().trim().max(500).nullable().optional(),
});

export type CreateMeetingInput = z.input<typeof createMeetingSchema>;

export interface MeetingRecord {
  id: string;
  oc_id: string;
  reference_number: string | null;
  meeting_type: MeetingType;
  title: string;
  date_time: string;
  location: string | null;
  virtual_meeting_link: string | null;
  status: MeetingStatus;
  notice_sent_at: string | null;
  created_at: string;
}
