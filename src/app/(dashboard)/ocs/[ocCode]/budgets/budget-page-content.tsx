"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, PieChart, CheckCircle2, CircleDashed, Download } from "lucide-react";
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

function BudgetCard({ budget }: { budget: BudgetWithItems }) {
  const ocCode = useOCCode();
  const isDraft = budget.status === "draft";
  const fundLabel = FUND_LABEL[budget.fund_type] ?? budget.fund_type;
  return (
    <div className="group relative">
      <Link href={`/ocs/${ocCode}/budgets/${budget.id}`} className="block">
        <Card
          className={`transition-colors hover:border-primary/30 cursor-pointer ${isDraft ? "border-dashed" : ""}`}
        >
          <CardContent className="pt-5">
            <div className="flex items-center gap-3 pr-10">
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
                <p className="mt-1 text-xs text-muted-foreground">
                  {budget.items.length} item{budget.items.length === 1 ? "" : "s"}
                  {isDraft ? "  ,  draft, click to review & approve" : "  ,  approved"}
                </p>
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
      {/* Quick PDF download , absolutely positioned so it doesn't take part
          in the card's flex layout. Hidden until hover so the card stays
          clean. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(`/api/budgets/${budget.id}/pdf`, "_blank");
        }}
        aria-label="Download PDF"
        className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md bg-card border border-border text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
    </div>
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
  const [budgets, setBudgets] = useState<BudgetWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculate current financial year (used to highlight the present FY group)
  const now = new Date();
  const fyStartMonth = financialYearStartMonth ?? 7;
  const currentYear = now.getFullYear();
  const fyStartYear = now.getMonth() + 1 >= fyStartMonth ? currentYear : currentYear - 1;
  const financialYear = `${fyStartYear}-${fyStartYear + 1}`;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const buds = await getOCBudgets(ocId);
      if (mounted) {
        setBudgets(buds);
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

  const current = budgets.filter((b) => b.financial_year === financialYear);
  const previous = budgets.filter((b) => b.financial_year !== financialYear);

  return (
    <div className="space-y-8">
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
        <>
          {current.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Current financial year ({financialYear})</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {current.map((b) => <BudgetCard key={b.id} budget={b} />)}
              </div>
            </div>
          )}
          {previous.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Previous years</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {previous.map((b) => <BudgetCard key={b.id} budget={b} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
