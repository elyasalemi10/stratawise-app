import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors rules-list.tsx.
//
// The search box and the "Add rule" dropdown trigger are fixed, so they
// render for real. Only the source-document line and the rule cards are
// server data. This used to be the generic PageSkeleton.

export function RulesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input disabled placeholder="Search rules" className="w-64" />
        <Skeleton className="h-3 w-48" />
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" disabled>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add rule
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {[
          "w-11/12",
          "w-3/4",
          "w-5/6",
          "w-2/3",
        ].map((w, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-3.5 w-10" />
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className={`mt-2 h-3.5 ${w}`} />
              <Skeleton className="mt-1.5 h-3.5 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
