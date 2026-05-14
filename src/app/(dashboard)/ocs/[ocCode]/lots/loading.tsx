import { Skeleton } from "@/components/ui/skeleton";

export default function LotsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/50 px-4 py-2.5 flex gap-8">
          {["Owner name", "Email", "Entitlement", "Unit", "Lot #", "Occupied", "Status", "Balance"].map((h) => (
            <Skeleton key={h} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-8 border-t border-border/50">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
