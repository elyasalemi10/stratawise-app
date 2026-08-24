import { DashboardSkeleton } from "./dashboard-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// DashboardClient is continuous rather than a blank frame.
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}
