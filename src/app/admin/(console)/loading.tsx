import { KpiSkeleton } from "@/components/shared/kpi-skeleton";

// Platform-wide counts. The labels are fixed, only the numbers shimmer.
export default function AdminConsoleLoading() {
  return (
    <div className="space-y-6">
      <KpiSkeleton
        labels={["Management firms", "Owners corporations", "Lots managed", "Lot owners"]}
        columns={4}
      />
    </div>
  );
}
