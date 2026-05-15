import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state for /ocs/new. Mirrors the live chrome: X corner button, no
// autosave copy, and the 4-step indicator rendered flat (no active highlight).
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative flex h-12 items-center">
        <span className="absolute -left-4 inline-flex h-8 w-8 items-center justify-center text-muted-foreground">
          <X className="h-5 w-5" />
        </span>
        <div className="mx-auto flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
              {i < 3 && <Skeleton className="mt-6 h-px w-10" />}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-6 space-y-6">
        <div className="text-center">
          <Skeleton className="mx-auto h-6 w-72" />
          <Skeleton className="mx-auto mt-2 h-4 w-96" />
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
    </div>
  );
}
