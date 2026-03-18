import { PageHeader } from "@/components/shared/page-header";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your strata management portfolio"
      />
      <div className="rounded-lg border border-border bg-card p-5 shadow-none">
        <p className="text-sm text-muted-foreground">
          Dashboard content will be built in Phase 2.
        </p>
      </div>
    </div>
  );
}
