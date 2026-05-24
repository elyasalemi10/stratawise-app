"use client";

import { useMemo, useState } from "react";
import { Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ACCOUNT_TYPE_LABEL, type CoaAccount, type CoaAccountType } from "@/lib/chart-of-accounts";
import { CreateAccountDrawer } from "@/components/chart-of-accounts/create-account-drawer";

const TYPE_BADGE: Record<CoaAccountType, string> = {
  asset: "bg-blue-50 text-blue-700 border-blue-200",
  liability: "bg-rose-50 text-rose-700 border-rose-200",
  equity: "bg-violet-50 text-violet-700 border-violet-200",
  income: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expense: "bg-amber-50 text-amber-700 border-amber-200",
};

// Section dividers shown between code bands so the long list reads as five
// logical groups instead of a wall of numbers.
const BANDS: { range: string; label: string; starts: string }[] = [
  { range: "1000s", label: "Assets", starts: "1" },
  { range: "2000s", label: "Liabilities", starts: "2" },
  { range: "3000s", label: "Member funds / Equity", starts: "3" },
  { range: "4000s", label: "Income", starts: "4" },
  { range: "5000s", label: "Expenses (insurance, compliance, professional)", starts: "5" },
  { range: "6000s", label: "Expenses (operating, maintenance)", starts: "6" },
];

export function ChartOfAccountsContent({ initialAccounts }: { initialAccounts: CoaAccount[] }) {
  const [accounts, setAccounts] = useState<CoaAccount[]>(initialAccounts);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CoaAccountType | "all">("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => !a.archived_at)
      .filter((a) => typeFilter === "all" || a.account_type === typeFilter)
      .filter((a) => {
        if (!q) return true;
        return a.code.includes(q) || a.name.toLowerCase().includes(q);
      });
  }, [accounts, query, typeFilter]);

  // Group filtered accounts by leading digit so we can render banded section
  // headers between them.
  const grouped = useMemo(() => {
    const map = new Map<string, CoaAccount[]>();
    for (const a of filtered) {
      const key = a.code[0] ?? "?";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return BANDS.map((band) => ({ ...band, items: map.get(band.starts) ?? [] }))
      .filter((band) => band.items.length > 0);
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Firm-wide accounts that every OC&apos;s budgets, levies and reports draw from.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code or name"
            className="w-48"
          />
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter((v as CoaAccountType | "all") ?? "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="asset">{ACCOUNT_TYPE_LABEL.asset}</SelectItem>
              <SelectItem value="liability">{ACCOUNT_TYPE_LABEL.liability}</SelectItem>
              <SelectItem value="equity">{ACCOUNT_TYPE_LABEL.equity}</SelectItem>
              <SelectItem value="income">{ACCOUNT_TYPE_LABEL.income}</SelectItem>
              <SelectItem value="expense">{ACCOUNT_TYPE_LABEL.expense}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="size-4" />
            Add account
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No accounts match"
          description={query || typeFilter !== "all" ? "Try clearing the filters." : "Add your first account to get started."}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map((band) => (
            <div key={band.range}>
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="text-sm font-semibold text-foreground">{band.label}</h2>
                <span className="text-xs text-muted-foreground">{band.range}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table variant="striped">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-28">Type</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {band.items.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-xs">{a.code}</TableCell>
                        <TableCell className="text-sm text-foreground">{a.name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[a.account_type]}`}>
                            {ACCOUNT_TYPE_LABEL[a.account_type]}
                          </span>
                        </TableCell>
                        <TableCell>
                          {a.is_system && <Badge variant="neutral" className="rounded-full">Built-in</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreated={(account) => setAccounts((prev) => [...prev, account].sort((a, b) => a.code.localeCompare(b.code)))}
      />
    </div>
  );
}
