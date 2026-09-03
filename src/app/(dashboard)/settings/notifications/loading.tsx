import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Only the saved values load; the rows themselves are a fixed list.
export default function Loading() {
  return (
    <Card>
      <CardContent className="pt-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-border/50 py-3 last:border-b-0"
          >
            <Skeleton className="h-3.5 w-52" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
