import { ChevronLeft, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors meeting-detail-content.tsx.
//
// The "Meetings" back link and both actions are fixed, so they render for
// real. Only the meeting title, its status badge and the card contents are
// server data. This used to be the generic PageSkeleton.

export function MeetingDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <span className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Meetings
        </span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Button disabled>
              <Send className="size-4" />
              Send notice
            </Button>
            <Button variant="secondary" disabled>
              <Trash2 className="size-4" />
              Cancel meeting
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-3/5" />
        </CardContent>
      </Card>
    </div>
  );
}
