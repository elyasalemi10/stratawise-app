"use client";

import { FileText } from "lucide-react";
import { useCachedData } from "@/lib/use-cached-data";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { LevyStatusBadge } from "@/components/shared/levy-status-badge";
import { getOwnerLeviesPageData, type OwnerLeviesPageData } from "./data";
import { OwnerLeviesSkeleton } from "./owner-levies-skeleton";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function OwnerLeviesClient() {
  const { data, loading } = useCachedData<OwnerLeviesPageData>(
    "owner-levies",
    getOwnerLeviesPageData,
  );

  if (loading || !data) return <OwnerLeviesSkeleton />;

  if (!data.hasLots) {
    return (
      <EmptyState
        icon={FileText}
        title="No levies yet"
        description="You'll see your levy notices here once they've been issued."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total levied
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatCurrency(data.totalLevied)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Total paid
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[hsl(160,100%,37%)]">
              {formatCurrency(data.totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Outstanding
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums">
              {formatCurrency(data.outstanding)}
            </p>
          </CardContent>
        </Card>
      </div>

      {data.levies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No levies issued yet"
          description="Your levy notices will appear here once issued by your strata manager."
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <div className="space-y-0 divide-y divide-border">
              {data.levies.map((levy) => {
                const remaining = (levy.amount ?? 0) - levy.amount_paid;

                return (
                  <div key={levy.id} className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {levy.reference_number}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {levy.oc_name}
                          {levy.lot_number !== null ? ` · Lot ${levy.lot_number}` : ""} · Due{" "}
                          {levy.due_date}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatCurrency(levy.amount ?? 0)}
                        </p>
                        {remaining > 0 && (
                          <p className="text-xs text-destructive tabular-nums">
                            {formatCurrency(remaining)} remaining
                          </p>
                        )}
                      </div>
                      <LevyStatusBadge
                        status={
                          levy.status as
                            | "draft"
                            | "issued"
                            | "partially_paid"
                            | "paid"
                            | "overdue"
                            | "written_off"
                        }
                        dueDate={levy.due_date}
                        reminderSent={levy.reminder_sent}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
