import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

// No shimmer. The page itself is a fixed empty state (meetings for lot
// owners are not built yet), so there is nothing arriving for a skeleton to
// stand in for. Rendering the destination directly means the route swap has
// no visible loading step at all.
//
// Mirrors meetings/page.tsx.
export default function Loading() {
  return (
    <EmptyState
      illustration="calendar"
      title="No meetings yet"
      description="Meeting notices, agendas, and minutes will appear here once your strata manager schedules them."
    />
  );
}
