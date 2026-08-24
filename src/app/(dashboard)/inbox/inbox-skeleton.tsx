import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors inbox-content.tsx.
//
// The inbox is a two-pane layout: a fixed-width list on the left, a reading
// pane on the right. With nothing open the right pane is fixed copy and the
// two section headings are fixed too, so all three render for real and only
// the rows shimmer. The shell is identical whether the inbox is loading,
// empty, or full, so nothing moves as it fills in.

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted/60 px-3 py-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <Skeleton className="h-3 w-4" />
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
            <Skeleton className="mt-1.5 h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="flex h-full flex-col overflow-hidden lg:sticky lg:top-4">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <SectionHeading label="Unread" />
          <Rows count={3} />
          <SectionHeading label="Read" />
          <Rows count={5} />
        </CardContent>
      </Card>

      <div className="hidden min-h-0 lg:block">
        <Card>
          <CardContent className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Mail className="size-10 text-muted-foreground/40" />
            <p>Pick an email from the list to read it.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
