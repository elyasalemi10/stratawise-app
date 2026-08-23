import { KpiSkeleton } from "@/components/shared/kpi-skeleton";

// The three KPI labels are fixed copy in page.tsx, so only the figures
// shimmer.
export default function LeviesLoading() {
  return (
    <div className="space-y-6">
      <KpiSkeleton labels={["Total levied", "Total paid", "Outstanding"]} columns={3} />
    </div>
  );
}
