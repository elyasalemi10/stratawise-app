"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, PieChart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { getOCBudgets, type BudgetWithItems } from "@/lib/actions/budget";
import { useOCCode } from "@/lib/oc-context";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const KNOWN_FUNDS = new Set(["administrative", "capital_works", "maintenance_plan"]);

// Sum items per fund-type bucket. Unknown fund types (custom funds when
// they ship) fall into "other" so the column is future-proof.
function fundSplit(budget: BudgetWithItems): {
  administrative: number;
  capital_works: number;
  maintenance_plan: number;
  other: number;
} {
  const out = { administrative: 0, capital_works: 0, maintenance_plan: 0, other: 0 };
  for (const it of budget.items) {
    const f = it.fund_type ?? budget.fund_type ?? null;
    const amt = Number(it.amount) || 0;
    if (f === "administrative") out.administrative += amt;
    else if (f === "capital_works") out.capital_works += amt;
    else if (f === "maintenance_plan") out.maintenance_plan += amt;
    else if (f && !KNOWN_FUNDS.has(f)) out.other += amt;
    else out.other += amt; // null fund_type falls through to Other
  }
  return out;
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
  void financialYearStartMonth;

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
        <Card>
          <CardContent className="pt-5">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

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
        <Card>
          <CardContent className="pt-5">
            <div className="overflow-hidden rounded-md border border-border">
              <Table variant="striped">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Financial Year</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Admin</TableHead>
                    <TableHead className="text-right">Capital Works</TableHead>
                    <TableHead className="text-right">Maintenance</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((b) => {
                    const split = fundSplit(b);
                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <Link
                            href={`/ocs/${ocCode}/budgets/${b.id}`}
                            className="text-foreground hover:underline"
                          >
                            {b.financial_year}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.status === "approved" ? "success" : "neutral"}>
                            {b.status === "approved" ? "Approved" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-foreground text-sm truncate max-w-md">
                          {b.description ?? ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {split.administrative > 0 ? formatCurrency(split.administrative) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {split.capital_works > 0 ? formatCurrency(split.capital_works) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {split.maintenance_plan > 0 ? formatCurrency(split.maintenance_plan) : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {split.other > 0 ? formatCurrency(split.other) : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
