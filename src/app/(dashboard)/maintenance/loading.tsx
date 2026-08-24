import { MaintenanceSkeleton } from "./maintenance-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// MaintenanceClient is continuous rather than a blank frame.
export default function MaintenanceLoading() {
  return <MaintenanceSkeleton />;
}
