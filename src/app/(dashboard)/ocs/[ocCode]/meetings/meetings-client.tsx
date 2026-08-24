"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { MeetingsContent } from "./meetings-content";
import { getMeetingsPageData, type MeetingsPageData } from "./data";
import { MeetingsSkeleton } from "./meetings-skeleton";

export function MeetingsClient({ ocId, ocCode }: { ocId: string; ocCode: string }) {
  const fetcher = useCallback(() => getMeetingsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<MeetingsPageData>(`meetings:${ocId}`, fetcher);

  if (loading || !data) return <MeetingsSkeleton />;

  return (
    <MeetingsContent
      ocId={ocId}
      ocCode={ocCode}
      meetings={data.meetings}
      readOnly={data.readOnly}
    />
  );
}
