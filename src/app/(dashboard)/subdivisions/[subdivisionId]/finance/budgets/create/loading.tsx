import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CreateBudgetLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Create budget</h1>
        <Skeleton className="h-4 w-36" />
      </div>
      <Card>
        <CardContent className="pt-5 space-y-3">
          <p className="text-sm font-medium text-foreground">Fund type</p>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-36 rounded-md" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <p className="text-sm font-medium text-foreground mb-3">Budget items</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2.5 flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Category / Description</span>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Annual amount</span>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex justify-between border-t border-border/50">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
