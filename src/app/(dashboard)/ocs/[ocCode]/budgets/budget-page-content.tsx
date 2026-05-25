"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, PieChart, CheckCircle2, CircleDashed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getOCBudgets, type BudgetWithItems } from "@/lib/actions/budget";
import { useOCCode } from "@/lib/oc-context";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const FUND_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Card lookups the budget by fund + year (one card per budget) and shows the
// fund name + last-edited date. Click navigates to the per-budget detail page
// where the PDF download lives.
function BudgetCard({ budget }: { budget: BudgetWithItems & { updated_at?: string } }) {
  const ocCode = useOCCode();
  const isDraft = budget.status === "draft";
  const fundLabel = FUND_LABEL[budget.fund_type] ?? budget.fund_type;
  // updated_at lives on the row but isn't always on BudgetWithItems , fall
  // back to approved_at then ""
  const lastEditedSrc =
    (budget as { updated_at?: string }).updated_at ??
    budget.approved_at ??
    null;
  const lastEdited = lastEditedSrc ? dateFmt.format(new Date(lastEditedSrc)) : null;

  return (
    <Link href={`/ocs/${ocCode}/budgets/${budget.id}`} className="block">
      <Card
        className={`transition-colors hover:border-primary/30 cursor-pointer ${isDraft ? "border-dashed" : ""}`}
      >
        <CardContent className="pt-5">
          <div className="flex items-center gap-3">
            {isDraft ? (
              <CircleDashed className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {fundLabel}{" "}
                <span className="text-muted-foreground font-normal">, {budget.financial_year}</span>
              </p>
              {lastEdited && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last edited {lastEdited}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-base font-bold tabular-nums text-foreground">
                {formatCurrency(Number(budget.total_amount))}
              </p>
              <p className="text-xs text-muted-foreground">total annual</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function BudgetPageContent({
  ocId,
  financialYearStartMonth,
}: {
  ocId: string;
  financialYearStartMonth: number;
}) {
  const ocCode = useOCCode();
  const [budgets, setBudgets] = useState<(BudgetWithItems & { updated_at?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  void financialYearStartMonth;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const buds = await getOCBudgets(ocId);
      if (mounted) {
        setBudgets(buds as (BudgetWithItems & { updated_at?: string })[]);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [ocId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="mt-1.5 h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // No more current-FY heading + previous-years split , the cards' year
  // label + last-edited date give the manager everything they need to scan
  // the list, and the heading was eating vertical space the cards could use.
  const sorted = [...budgets].sort((a, b) =>
    b.financial_year.localeCompare(a.financial_year),
  );

  return (
    <div className="space-y-4">
      {budgets.length > 0 && (
        <div className="flex items-center justify-end">
          <Link href={`/ocs/${ocCode}/budgets/create`}>
            <Button size="sm">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create budget
            </Button>
          </Link>
        </div>
      )}

      {budgets.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="No budgets yet"
          description="Create an annual budget to start generating levy notices."
          action={
            <Link href={`/ocs/${ocCode}/budgets/create`}>
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create budget
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((b) => <BudgetCard key={b.id} budget={b} />)}
        </div>
      )}
    </div>
  );
}
