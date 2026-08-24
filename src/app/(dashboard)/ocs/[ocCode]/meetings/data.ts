"use server";

import { listMeetings } from "@/lib/actions/meetings";
import { requireOCAccess } from "@/lib/auth";

export interface MeetingsPageData {
  meetings: Awaited<ReturnType<typeof listMeetings>>;
  readOnly: boolean;
}

export async function getMeetingsPageData(ocId: string): Promise<MeetingsPageData> {
  const profile = await requireOCAccess(ocId);
  return {
    meetings: await listMeetings(ocId),
    readOnly: profile.role === "lot_owner",
  };
}
