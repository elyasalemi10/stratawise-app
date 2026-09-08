"use server";

import { getMeetingDetail } from "@/lib/actions/meetings";
import { resolveId } from "@/lib/short-code";
import { getOCNotifyOwners } from "@/lib/actions/recurring-jobs";
import { requireOCAccess } from "@/lib/auth";

export interface MeetingDetailPageData {
  meeting: NonNullable<Awaited<ReturnType<typeof getMeetingDetail>>>;
  owners: Awaited<ReturnType<typeof getOCNotifyOwners>>;
  readOnly: boolean;
}

export async function getMeetingDetailPageData(
  ocId: string,
  meetingId: string,
): Promise<MeetingDetailPageData> {
  // The URL carries a short code; everything below joins on the UUID.
  // Resolved HERE rather than in the page shell so the loading
  // boundary, which only has the raw segment, can render the real
  // client and paint from cache exactly as the page does.
  const resolvedMeetingId = await resolveId("meetings", meetingId);
  if (!resolvedMeetingId) throw new Error("Not found");
  meetingId = resolvedMeetingId;

  const profile = await requireOCAccess(ocId);

  const [meeting, owners] = await Promise.all([
    getMeetingDetail(meetingId),
    getOCNotifyOwners(ocId),
  ]);
  if (!meeting || meeting.oc_id !== ocId) throw new Error("Meeting not found.");

  return { meeting, owners, readOnly: profile.role === "lot_owner" };
}
