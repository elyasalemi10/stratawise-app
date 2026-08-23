import { cn } from "@/lib/utils";

// Skeletons paint IMMEDIATELY.
//
// This used to render nothing for the first 200ms so that a fast navigation
// skipped the skeleton instead of flashing one. That made sense when a
// skeleton was the only thing standing between you and the data. It stopped
// making sense once useCachedData arrived: `loading` is now true ONLY when
// there is no cached data at all, so the app already knows a real fetch is
// coming and a skeleton is always the right answer.
//
// Worse, the delay was per-instance. A table skeleton renders its chrome
// straight away but every <Skeleton> cell inside it stayed blank for 200ms,
// so a first visit showed an empty table with hollow rows, THEN the shimmer,
// then the data. Three states where there should be two.
//
// No hooks, so this renders on the server too and costs nothing in the
// client bundle.
//
// The look is a sweep, not a pulse: a pulsing opacity reads as "something is
// broken and flashing", a highlight travelling left to right reads as
// loading. See .skeleton-shimmer in globals.css. bg-muted underneath is what
// shows when prefers-reduced-motion drops the gradient.

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
