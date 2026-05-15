import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Loading state for /ocs/new. Server component — has no access to
// searchParams, so it CAN'T know which step the URL wants. We keep the
// chrome (top bar with X + auto-save note) visible and render a flat row
// of 4 step-indicator dots without highlighting one — the in-component
// skeleton (which CAN read ?step=) takes over the moment the page mounts
// and shows the correct active step. The handoff is invisible because
// both layouts match.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="relative mb-2 flex h-8 items-center">
        <span className="absolute left-0 top-0 inline-flex h-6 w-6 items-center justify-center text-muted-foreground">
          <X className="h-4 w-4" />
        </span>
        <p className="w-full text-center text-xs text-muted-foreground">
          Each step is saved when you click <strong>Continue</strong>. You can leave anytime
          and resume from the OC switcher in the sidebar.
        </p>
      </div>
      {/* Flat step-indicator shape — 4 logo circles, no active highlight.
          Matches the spacing of the real StepIndicator so the swap is
          structurally identical. */}
      <div className="mb-8 flex items-start justify-center gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
            {i < 3 && <Skeleton className="mt-5 h-px w-8" />}
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-6">
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
