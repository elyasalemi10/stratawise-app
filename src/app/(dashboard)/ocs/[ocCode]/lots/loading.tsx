import { LotsSkeleton } from "./lots-skeleton";

// Renders the SAME skeleton the client renders.
//
// This covers the gap while the server shell streams. Returning null here
// instead left a blank grey page for the length of that round trip, then the
// skeleton appeared once the client mounted, which is a worse first frame
// than a shimmer that is already correct.
//
// Rendering it in both places used to cause a visible double-flash, but only
// because <Skeleton> waited 200ms before showing and that delay restarted on
// the second mount. Skeleton now paints immediately, so the handover from
// this boundary to LotsClient is continuous.
export default function LotsLoading() {
  return <LotsSkeleton />;
}
