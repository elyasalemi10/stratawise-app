import { SectionHeader } from "@/components/shared/section-header";
import { ChartOfAccountsSkeleton } from "./coa-skeleton";

// Same skeleton the client renders, so the handover from this boundary to
// ChartOfAccountsClient is continuous rather than a blank frame.
export default function ChartOfAccountsLoading() {
  return (
    <>
      <SectionHeader title="Chart of accounts" />
      <ChartOfAccountsSkeleton />
    </>
  );
}
