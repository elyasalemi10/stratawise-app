import { InsuranceSkeleton } from "./insurance-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// the client component is continuous rather than a blank frame.
export default function Loading() {
  return <InsuranceSkeleton />;
}
