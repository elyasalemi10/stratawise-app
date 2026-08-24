import { LotDetailSkeleton } from "./lot-detail-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// LotDetailClient is continuous rather than a blank frame.
export default function Loading() {
  return <LotDetailSkeleton />;
}
