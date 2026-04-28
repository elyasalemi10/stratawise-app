"use client";

import { useState, useEffect } from "react";
import { Plus, DollarSign, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getSubdivisionBudgets,
  approveBudget,
  type BudgetWithItems,
} from "@/lib/actions/budget";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// ─── Budget Card ──────────────────────────────────────────

function BudgetCard({
  budget,
  subdivisionId,
  onApproved,
}: {
  budget: BudgetWithItems;
  subdivisionId: string;
  onApproved: () => void;
}) {
  const [approving, setApproving] = useState(false);

  async function handleApprove() {
    setApproving(true);
    const result = await approveBudget(subdivisionId, budget.id);
    setApproving(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Budget approved");
      onApproved();
    }
  }

  const fundLabel = budget.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund";

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{fundLabel}</h3>
            <p className="text-xs text-muted-foreground">{budget.financial_year}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={budget.status === "approved" ? "success" : "warning"}>
              {budget.status}
            </Badge>
            {budget.status === "draft" && (
              <Button size="sm" variant="outline" onClick={handleApprove} disabled={approving}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {approving ? "Approving..." : "Approve"}
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {budget.items.map((item) => (
                <tr key={item.id} className="border-t border-border/50">
                  <td className="px-4 py-2 text-foreground">
                    {item.description || item.category_name}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground/20">
                <td className="px-4 py-2.5 font-semibold text-foreground">Total</td>
                <td className="px-4 py-2.5 font-bold text-right tabular-nums text-foreground">
                  {formatCurrency(budget.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Budget Page ───────────────────────────────────

export function BudgetTab({ subdivisionId, financialYearStartMonth }: { subdivisionId: string; financialYearStartMonth: number }) {
  const [budgets, setBudgets] = useState<BudgetWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculate current financial year
  const now = new Date();
  const fyStartMonth = financialYearStartMonth ?? 7;
  const currentYear = now.getFullYear();
  const fyStartYear = now.getMonth() + 1 >= fyStartMonth ? currentYear : currentYear - 1;
  const financialYear = `${fyStartYear}-${fyStartYear + 1}`;

  async function loadData() {
    setLoading(true);
    const buds = await getSubdivisionBudgets(subdivisionId);
    setBudgets(buds);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subdivisionId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">Budgets</h1>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="mt-1.5 h-3 w-20" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2.5 flex justify-between">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  {[0, 1, 2, 3].map((j) => (
                    <div key={j} className="px-4 py-2.5 flex justify-between border-t border-border/50">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                  <div className="px-4 py-3 flex justify-between border-t-2 border-foreground/20">
                    <Skeleton className="h-3.5 w-12" />
                    <Skeleton className="h-3.5 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const currentBudgets = budgets.filter((b) => b.financial_year === financialYear);
  const hasAdmin = currentBudgets.some((b) => b.fund_type === "administrative");
  const hasCapital = currentBudgets.some((b) => b.fund_type === "capital_works");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Budgets</h1>
        {(!hasAdmin || !hasCapital) && (
          <Link href={`/subdivisions/${subdivisionId}/budgets/create`}>
            <Button size="sm">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create budget
            </Button>
          </Link>
        )}
      </div>

      {/* Budget cards */}
      {currentBudgets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <DollarSign className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No budgets yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create an annual budget to start generating levy notices.
            </p>
            <Link href={`/subdivisions/${subdivisionId}/budgets/create`}>
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create budget
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {currentBudgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              subdivisionId={subdivisionId}
              onApproved={loadData}
            />
          ))}
        </div>
      )}

      {/* Previous years */}
      {budgets.filter((b) => b.financial_year !== financialYear).length > 0 && (
        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">Previous years</h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {budgets
              .filter((b) => b.financial_year !== financialYear)
              .map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  subdivisionId={subdivisionId}
                  onApproved={loadData}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
