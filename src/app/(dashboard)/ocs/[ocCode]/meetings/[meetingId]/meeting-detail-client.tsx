"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { MeetingDetailContent } from "./meeting-detail-content";
import { getMeetingDetailPageData, type MeetingDetailPageData } from "./data";
import { MeetingDetailSkeleton } from "./meeting-detail-skeleton";

export function MeetingDetailClient({
  ocId,
  ocCode,
  meetingId,
}: {
  ocId: string;
  ocCode: string;
  meetingId: string;
}) {
  const fetcher = useCallback(
    () => getMeetingDetailPageData(ocId, meetingId),
    [ocId, meetingId],
  );
  const { data, loading } = useCachedData<MeetingDetailPageData>(
    `meeting:${meetingId}`,
    fetcher,
  );

  if (loading || !data) return <MeetingDetailSkeleton />;

  return (
    <MeetingDetailContent
      ocCode={ocCode}
      meeting={data.meeting}
      owners={data.owners}
      readOnly={data.readOnly}
    />
  );
}
