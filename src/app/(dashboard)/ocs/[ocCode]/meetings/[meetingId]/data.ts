"use server";

import { getMeetingDetail } from "@/lib/actions/meetings";
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
  const profile = await requireOCAccess(ocId);

  const [meeting, owners] = await Promise.all([
    getMeetingDetail(meetingId),
    getOCNotifyOwners(ocId),
  ]);
  if (!meeting || meeting.oc_id !== ocId) throw new Error("Meeting not found.");

  return { meeting, owners, readOnly: profile.role === "lot_owner" };
}
