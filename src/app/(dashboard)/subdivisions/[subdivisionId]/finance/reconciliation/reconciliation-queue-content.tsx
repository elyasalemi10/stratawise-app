"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTransition } from "react";
import {
  FileText,
  Inbox,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MatchStatusBadge } from "@/components/shared/match-status-badge";
import type {
  ReconciliationQueueResult,
  ReconciliationQueueRow,
  TransactionSource,
} from "@/lib/validations/reconciliation";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const SOURCE_LABEL: Record<TransactionSource, string> = {
  manual: "Manual",
  csv: "CSV",
  basiq: "Basiq",
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unmatched", label: "Unmatched" },
  { value: "manually_matched", label: "Manually matched" },
  { value: "auto_matched", label: "Auto matched" },
  { value: "excluded", label: "Excluded" },
  { value: "all", label: "All" },
];

interface Props {
  subdivisionId: string;
  queue: ReconciliationQueueResult;
  activeFilters: {
    bankAccountId: string | null;
    status: string;
    source: string;
  };
}

export function ReconciliationQueueContent({
  subdivisionId,
  queue,
  activeFilters,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const base = `/subdivisions/${subdivisionId}/finance/reconciliation`;

  function updateFilter(key: "bank" | "status" | "source", value: string | null) {
    const params = new URLSearchParams();
    if (activeFilters.bankAccountId && key !== "bank") params.set("bank", activeFilters.bankAccountId);
    if (activeFilters.status !== "unmatched" && key !== "status") params.set("status", activeFilters.status);
    if (activeFilters.source !== "all" && key !== "source") params.set("source", activeFilters.source);
    if (value && value !== (key === "status" ? "unmatched" : "all")) {
      params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${base}?${qs}` : base);
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.replace(base);
    });
  }

  const hasAnyFilters =
    !!activeFilters.bankAccountId ||
    activeFilters.status !== "unmatched" ||
    activeFilters.source !== "all";

  const { rows, unmatchedCount, unmatchedValue, oldestUnmatchedDays, matchedThisMonthValue, availableSources, bankAccounts } = queue;

  const bankAccountLabel = (id: string | null) => {
    if (!id) return "All accounts";
    const acct = bankAccounts.find((a) => a.id === id);
    return acct ? acct.name : "Unknown";
  };

  return (
    <div className="px-6 py-6 space-y-6">
      {/* Top action row */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {queue.total} transaction{queue.total === 1 ? "" : "s"} matching current filters
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/subdivisions/${subdivisionId}/finance/bank-account`}>
            <Button variant="outline" size="sm">
              <FileText className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Unmatched"
          value={String(unmatchedCount)}
          sub={unmatchedCount === 1 ? "transaction" : "transactions"}
        />
        <Kpi
          label="Oldest unmatched"
          value={oldestUnmatchedDays !== null ? `${oldestUnmatchedDays}` : "—"}
          sub={oldestUnmatchedDays !== null ? (oldestUnmatchedDays === 1 ? "day" : "days") : "none pending"}
        />
        <Kpi
          label="Unmatched value"
          value={formatCurrency(unmatchedValue)}
          sub="awaiting reconciliation"
        />
        <Kpi
          label="Matched this month (all accounts)"
          value={formatCurrency(matchedThisMonthValue)}
          sub=""
        />
      </div>

      {/* Filters */}
      <Card className="shadow-none">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <FilterField label="Bank account">
              <Select
                value={activeFilters.bankAccountId ?? "all"}
                onValueChange={(v) => updateFilter("bank", v === "all" ? null : v)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue>{bankAccountLabel(activeFilters.bankAccountId)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Source">
              <Select
                value={activeFilters.source}
                onValueChange={(v) => updateFilter("source", v)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {availableSources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Status">
              <Select
                value={activeFilters.status}
                onValueChange={(v) => updateFilter("status", v)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            {hasAnyFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table or empty state */}
      {rows.length === 0 ? (
        <EmptyState
          subdivisionId={subdivisionId}
          totalUnmatchedOnSubdivision={unmatchedCount}
          onClearFilters={clearFilters}
        />
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium text-right tabular-nums">Amount</th>
                    <th className="px-4 py-2.5 font-medium text-right tabular-nums">Matched</th>
                    <th className="px-4 py-2.5 font-medium text-right tabular-nums">Remaining</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium" aria-label="Row actions"></th>
                  </tr>
                </thead>
                <tbody className={isPending ? "opacity-60" : ""}>
                  {rows.map((row) => (
                    <QueueRow
                      key={row.id}
                      row={row}
                      subdivisionId={subdivisionId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-border bg-muted/20">
              <div className="text-xs text-muted-foreground">
                Showing {queue.total === 0 ? 0 : (queue.page - 1) * queue.pageSize + 1}–{Math.min(queue.page * queue.pageSize, queue.total)} of {queue.total}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={queue.page === 1 || isPending}
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (activeFilters.bankAccountId) params.set("bank", activeFilters.bankAccountId);
                    if (activeFilters.status !== "unmatched") params.set("status", activeFilters.status);
                    if (activeFilters.source !== "all") params.set("source", activeFilters.source);
                    params.set("page", String(queue.page - 1));
                    const qs = params.toString();
                    startTransition(() => {
                      router.replace(qs ? `${base}?${qs}` : base);
                    });
                  }}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={queue.page * queue.pageSize >= queue.total || isPending}
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (activeFilters.bankAccountId) params.set("bank", activeFilters.bankAccountId);
                    if (activeFilters.status !== "unmatched") params.set("status", activeFilters.status);
                    if (activeFilters.source !== "all") params.set("source", activeFilters.source);
                    params.set("page", String(queue.page + 1));
                    const qs = params.toString();
                    startTransition(() => {
                      router.replace(qs ? `${base}?${qs}` : base);
                    });
                  }}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-[28px] font-bold leading-tight tracking-tight tabular-nums text-foreground">
          {value}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function QueueRow({
  row,
  subdivisionId,
}: {
  row: ReconciliationQueueRow;
  subdivisionId: string;
}) {
  const href = `/subdivisions/${subdivisionId}/finance/reconciliation/${row.id}`;
  const isCredit = row.amount > 0;
  const amountClass = isCredit ? "text-[hsl(160,100%,37%)]" : "text-destructive";
  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.transaction_date)}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge variant="neutral">
          {SOURCE_LABEL[row.source] ?? row.source}
        </Badge>
      </td>
      <td className="px-4 py-3 max-w-[32rem]">
        <Link href={href} className="text-foreground hover:text-primary underline-offset-2 hover:underline">
          <div className="truncate">{row.description ?? "—"}</div>
          {row.detected_reference && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              Ref {row.detected_reference} · {row.bank_account_name}
            </div>
          )}
          {!row.detected_reference && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {row.bank_account_name}
            </div>
          )}
        </Link>
      </td>
      <td className={`px-4 py-3 text-right tabular-nums ${amountClass}`}>
        {formatCurrency(row.amount)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {row.matched_total > 0 ? formatCurrency(row.matched_total) : "—"}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {row.remaining > 0 ? formatCurrency(row.remaining) : "—"}
      </td>
      <td className="px-4 py-3">
        <MatchStatusBadge
          status={row.match_status}
          isVoided={row.is_voided}
          matchedTotal={row.matched_total}
          amount={row.amount}
        />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Link href={href}>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            View
          </Button>
        </Link>
      </td>
    </tr>
  );
}

function EmptyState({
  subdivisionId,
  totalUnmatchedOnSubdivision,
  onClearFilters,
}: {
  subdivisionId: string;
  totalUnmatchedOnSubdivision: number;
  onClearFilters: () => void;
}) {
  const noUnmatchedOnSubdivision = totalUnmatchedOnSubdivision === 0;

  return (
    <Card className="shadow-none">
      <CardContent className="py-16 text-center">
        <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <div className="mt-4 text-base font-semibold">
          {noUnmatchedOnSubdivision
            ? "No unmatched transactions"
            : "No results match your filters"}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {noUnmatchedOnSubdivision
            ? "All bank activity is reconciled."
            : "Try clearing filters or widening the date range."}
        </div>
        <div className="mt-6 flex items-center justify-center gap-2">
          {noUnmatchedOnSubdivision ? (
            <Link href={`/subdivisions/${subdivisionId}/finance/bank-account`}>
              <Button variant="outline" size="sm">
                <Wallet className="mr-2 h-4 w-4" />
                Open bank account
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
