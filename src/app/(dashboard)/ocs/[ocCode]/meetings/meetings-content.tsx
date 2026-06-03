"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Video, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import {
  MEETING_TYPE_LABELS,
  type MeetingRecord,
  type MeetingStatus,
  type MeetingType,
} from "@/lib/validations/meetings";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  draft: "Draft",
  notice_sent: "Notice sent",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<MeetingStatus, "neutral" | "info" | "warning" | "success" | "destructive"> = {
  draft: "neutral",
  notice_sent: "info",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function MeetingsContent({
  ocId,
  ocCode,
  meetings,
  readOnly,
}: {
  ocId: string;
  ocCode: string;
  meetings: MeetingRecord[];
  readOnly: boolean;
}) {
  void ocId;
  const createHref = `/ocs/${ocCode}/meetings/create`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {meetings.length} meeting{meetings.length === 1 ? "" : "s"}
        </p>
        {meetings.length > 0 && !readOnly && (
          <Link href={createHref} className={cn(buttonVariants({ size: "sm" }), "cursor-pointer")}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create meeting
          </Link>
        )}
      </div>

      {meetings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No meetings yet"
          description="Create an AGM, special general meeting, or committee meeting. Agendas, notices, and minutes build on each meeting."
          action={
            !readOnly ? (
              <Link href={createHref} className={cn(buttonVariants({ size: "sm" }))}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Create meeting
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <Card key={m.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{m.title}</h3>
                      <Badge variant={STATUS_VARIANT[m.status]} className="rounded-full">
                        {STATUS_LABEL[m.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {MEETING_TYPE_LABELS[m.meeting_type as MeetingType]}
                      {m.reference_number ? ` · ${m.reference_number}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatWhen(m.date_time)}
                      </span>
                      {m.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {m.location}
                        </span>
                      )}
                      {m.virtual_meeting_link && (
                        <span className="inline-flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5" />
                          Online
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

