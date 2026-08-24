import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors trust-accounts-content.tsx.
//
// The intro line and the "New trust account" button are fixed copy, so they
// render for real. Only the account cards are server data. This used to be
// the generic PageSkeleton, which is a different page.

export function TrustAccountsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Statutory trust accounts your firm holds funds in. Upload a bank statement
          (coming soon) and we&apos;ll auto-tag each transaction against the right OC
          and category.
        </p>
        <Button size="sm" disabled>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New trust account
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
