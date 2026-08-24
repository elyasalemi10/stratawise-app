import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors inbox-content.tsx.
//
// The inbox is a two-pane layout: a fixed-width message list on the left and
// a reading pane on the right. With nothing selected the right pane is a
// fixed placeholder, so it renders for real, and the list rows are the only
// thing waiting on the server. This used to be the generic PageSkeleton,
// which is a single full-width column and looks like a different page.

export function InboxSkeleton() {
  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="flex h-full flex-col overflow-hidden lg:sticky lg:top-4">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5">
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
