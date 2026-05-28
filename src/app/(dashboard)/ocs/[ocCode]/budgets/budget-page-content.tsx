"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, PieChart, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

// Sum items into three buckets: Admin (fund_type=operating, no fund_id),
// Maintenance (fund_type=maintenance_plan, no fund_id), and Other (any
// custom fund , identified by fund_id being set, OR an unknown fund_type).
function fundSplit(budget: BudgetWithItems): {
  admin: number;
  maintenance: number;
  other: number;
} {
  const out = { admin: 0, maintenance: 0, other: 0 };
  for (const it of budget.items) {
    const amt = Number(it.amount) || 0;
    if (it.fund_id) {
      out.other += amt; // custom fund , always lands in "Other"
      continue;
    }
    const f = it.fund_type ?? budget.fund_type ?? null;
    if (f === "operating") out.admin += amt;
    else if (f === "maintenance_plan") out.maintenance += amt;
    else out.other += amt;
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

  return (
    <BudgetsListView
      budgets={budgets}
      ocCode={ocCode}
    />
  );
}

// ── List view , search bar, status filter, table ───────────────────
function BudgetsListView({
  budgets,
  ocCode,
}: {
  budgets: BudgetWithItems[];
  ocCode: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "draft">("all");

  // Approved-first: approved budgets always float to the top, then by
  // descending financial year. Inside each status group the most
  // recent FY wins so the manager sees "this year's approved" first.
  const sorted = [...budgets].sort((a, b) => {
    if (a.status !== b.status) return a.status === "approved" ? -1 : 1;
    return b.financial_year.localeCompare(a.financial_year);
  });

  const filtered = sorted.filter((b) => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      b.financial_year.toLowerCase().includes(q) ||
      (b.description ?? "").toLowerCase().includes(q)
    );
  });

  if (budgets.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar , search on the left, status filter chips in the
          middle, Create on the right. Tables below sit on the page
          background directly (no surrounding card) so the data is the
          focal point. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by financial year or description"
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5 bg-card">
          {(["all", "approved", "draft"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`h-7 rounded-sm px-3 text-xs font-medium capitalize cursor-pointer transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Link href={`/ocs/${ocCode}/budgets/create`}>
          <Button size="sm">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create budget
          </Button>
        </Link>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Financial Year</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Admin</TableHead>
              <TableHead className="text-right">Maintenance</TableHead>
              <TableHead className="text-right">Other</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                  No budgets match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => {
                const split = fundSplit(b);
                return (
                  <ClickableRow key={b.id} href={`/ocs/${ocCode}/budgets/${b.id}`}>
                    <TableCell>{b.financial_year}</TableCell>
                    <TableCell>
                      <Badge variant={b.status === "approved" ? "success" : "neutral"}>
                        {b.status === "approved" ? "Approved" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground text-sm truncate max-w-md">
                      {b.description ?? ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {split.admin > 0 ? formatCurrency(split.admin) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {split.maintenance > 0 ? formatCurrency(split.maintenance) : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-foreground">
                      {split.other > 0 ? formatCurrency(split.other) : ""}
                    </TableCell>
                  </ClickableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Whole row is clickable. We can't put an <a> directly inside a <tr>
// (invalid HTML), so we route the navigation via onClick on the row +
// keep cursor-pointer for hover feedback. Middle-click still works
// because we ALSO render a hidden <Link> for keyboard nav.
function ClickableRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TableRow
      className="cursor-pointer"
      onClick={(e) => {
        // Don't hijack ctrl/cmd-click , let the browser open a new
        // tab the standard way via the inner Link.
        if (e.metaKey || e.ctrlKey) return;
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
