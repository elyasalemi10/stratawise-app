import { ContractorsSkeleton } from "./contractors-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// ContractorsClient is continuous rather than a blank frame.
export default function ContractorsLoading() {
  return <ContractorsSkeleton />;
}
