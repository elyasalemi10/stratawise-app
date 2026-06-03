"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
  ocCode,
  meetings,
  readOnly,
}: {
  ocId: string;
  ocCode: string;
  meetings: MeetingRecord[];
  readOnly: boolean;
}) {
  const router = useRouter();
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
          description="Create an AGM or special general meeting. Agendas, notices, and minutes build on each meeting."
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/ocs/${ocCode}/meetings/${m.id}`)}
                >
                  <TableCell className="font-medium tabular-nums text-foreground">{m.reference_number}</TableCell>
                  <TableCell>{MEETING_TYPE_LABELS[m.meeting_type as MeetingType]}</TableCell>
                  <TableCell>{m.title}</TableCell>
                  <TableCell>{formatWhen(m.date_time)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[m.status]} className="rounded-full">
                      {STATUS_LABEL[m.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
