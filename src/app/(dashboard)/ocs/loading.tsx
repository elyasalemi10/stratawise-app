import { OCsSkeleton } from "./ocs-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// OCsClient is continuous rather than a blank frame.
export default function OCsLoading() {
  return <OCsSkeleton />;
}
