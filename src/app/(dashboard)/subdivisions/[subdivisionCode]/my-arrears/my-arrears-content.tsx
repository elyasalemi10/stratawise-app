"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateLong } from "@/lib/utils";
import type { MyArrearsLevyRow } from "@/lib/actions/my-arrears";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

function formatLotLabel(lotNumber: number, unitNumber: string | null): string {
  if (unitNumber) return `Lot ${lotNumber} (Unit ${unitNumber})`;
  return `Lot ${lotNumber}`;
}

export function MyArrearsContent({
  rows,
  outstandingTotal,
}: {
  rows: MyArrearsLevyRow[];
  outstandingTotal: number;
}) {
  // Group rows by lot when owner owns multiple lots in this subdivision.
  const lotGroups = new Map<string, { label: string; rows: MyArrearsLevyRow[] }>();
  for (const r of rows) {
    const label = formatLotLabel(r.lot_number, r.unit_number);
    const existing = lotGroups.get(r.lot_id);
    if (existing) existing.rows.push(r);
    else lotGroups.set(r.lot_id, { label, rows: [r] });
  }
  const showGrouping = lotGroups.size >= 2;

  // Empty state.
  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-foreground">My arrears</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-[hsl(160,100%,37%)]/40" />
            <p className="mt-4 text-base font-medium text-foreground">
              No outstanding levies
            </p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              You&apos;re all up to date. We&apos;ll show any overdue or partially paid levies here as soon as they appear.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">My arrears</h1>

      {/* KPI: outstanding total — destructive when > 0, neutral when 0. */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Outstanding amount
              </p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-destructive">
                {formatCurrency(outstandingTotal)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-lot grouping (when 2+ lots) or flat list (single lot). */}
      {Array.from(lotGroups.values()).map((group) => (
        <Card key={group.label}>
          <CardContent className="pt-5 px-0">
            {showGrouping && (
              <div className="px-5 pb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
              </div>
            )}
            <div className="divide-y divide-border/50">
              {group.rows.map((row) => (
                <div key={row.id} className="px-5 py-4">
                  {/* Parent levy row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {row.reference_number}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Due {formatDateLong(row.due_date)} ·{" "}
                        {row.fund_type === "administrative" ? "Admin" : "Capital works"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(row.amount)}
                      </p>
                      <p className="mt-0.5 text-xs text-destructive tabular-nums">
                        {formatCurrency(row.outstanding)} outstanding
                      </p>
                    </div>
                  </div>

                  {/* Linked penalty interest sub-rows (indented). */}
                  {row.penalty_interest.length > 0 && (
                    <div className="mt-3 ml-4 border-l-2 border-warning/30 pl-3 space-y-2">
                      {row.penalty_interest.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="text-foreground">
                              <span className="text-warning">↳</span> Penalty interest accrued
                            </p>
                            <p className="text-muted-foreground">
                              {p.reference_number} · Due {formatDateLong(p.due_date)}
                            </p>
                          </div>
                          <div className="text-right shrink-0 tabular-nums">
                            <p className="text-foreground">{formatCurrency(p.amount)}</p>
                            <p className="text-destructive">
                              {formatCurrency(p.outstanding)} outstanding
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
