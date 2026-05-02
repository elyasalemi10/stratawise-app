"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useSubdivisionCode } from "@/lib/subdivision-context";
import {
  FileText,
  Inbox,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
import { AddManualTransactionDialog } from "@/components/shared/add-manual-transaction-dialog";
import { RecordCashReceiptDialog } from "@/components/shared/record-cash-receipt-dialog";
import { FilterChips } from "@/components/shared/filter-chips";
import { ReviewSuggestedBadge } from "@/components/shared/review-suggested-badge";
import { DuplicateBadge } from "@/components/shared/duplicate-badge";
import { FuzzyHintCell } from "@/components/reconciliation/fuzzy-hint-cell";
import {
  BankDuplicateReviewDialog,
  type BankDuplicateReviewPayload,
} from "@/components/reconciliation/bank-duplicate-review-dialog";
import {
  MatchMetadataDrawer,
  type MatchAuditPayload,
} from "@/components/reconciliation/match-metadata-drawer";
import { useMultiUrlState } from "@/hooks/use-multi-url-state";
import { getOrchestratorAuditForTransaction } from "@/lib/actions/reconciliation";
import type {
  ReconciliationQueueResult,
  ReconciliationQueueRow,
  TransactionSource,
} from "@/lib/validations/reconciliation";

const MATCH_CONFIDENCE_OPTIONS = [
  { value: "exact_reference", label: "Exact reference" },
  { value: "amount_match", label: "Amount match" },
  { value: "name_match", label: "Name match" },
  { value: "basiq_auto", label: "BPAY (Basiq)" },
  { value: "manual", label: "Manual" },
] as const;
type MatchConfidenceValue = (typeof MATCH_CONFIDENCE_OPTIONS)[number]["value"];
const MATCH_CONFIDENCE_ALLOWED = new Set<MatchConfidenceValue>(
  MATCH_CONFIDENCE_OPTIONS.map((o) => o.value),
);

const MATCH_METHOD_OPTIONS = [
  { value: "auto_reference", label: "Auto: reference" },
  { value: "auto_bpay_crn", label: "Auto: BPAY CRN" },
  { value: "auto_sender", label: "Auto: known sender" },
  { value: "auto_amount", label: "Auto: amount" },
  { value: "manual", label: "Manual" },
] as const;
type MatchMethodValue = (typeof MATCH_METHOD_OPTIONS)[number]["value"];
const MATCH_METHOD_ALLOWED = new Set<MatchMethodValue>(
  MATCH_METHOD_OPTIONS.map((o) => o.value),
);

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
  basiq: "Bank feed",
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
  const subdivisionCode = useSubdivisionCode();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addManualTxnOpen, setAddManualTxnOpen] = useState(false);
  const [recordReceiptOpen, setRecordReceiptOpen] = useState(false);
  const [selectedBankAccount, setSelectedBankAccount] = useState<{
    id: string;
    name: string;
    fund_type: "administrative" | "capital_works";
  } | null>(null);

  // Match-metadata drawer state. We open the drawer at the parent so a single
  // drawer instance is shared across all rows; the per-row badge fires
  // `onOpenAuditDrawer(bankTxnId)`.
  const [auditTxId, setAuditTxId] = useState<string | null>(null);
  const [auditPayload, setAuditPayload] = useState<
    MatchAuditPayload | null | undefined
  >(undefined);

  const openAuditDrawer = (bankTxnId: string) => {
    setAuditTxId(bankTxnId);
    setAuditPayload(undefined);
    void (async () => {
      const result = await getOrchestratorAuditForTransaction(bankTxnId);
      setAuditPayload(result);
    })();
  };

  // Multi-value chip filters (Match metadata + has-fuzzy-hint).
  const [matchConfidence, setMatchConfidence] = useMultiUrlState<MatchConfidenceValue>(
    "mc",
    { allowed: MATCH_CONFIDENCE_ALLOWED },
  );
  const [matchMethod, setMatchMethod] = useMultiUrlState<MatchMethodValue>(
    "mm",
    { allowed: MATCH_METHOD_ALLOWED },
  );

  const base = `/subdivisions/${subdivisionCode}/reconciliation`;

  // PP5-D-A: single-bool chip toggle for ?dup=1 (Possible duplicate filter).
  // Custom toggle (vs FilterChips) to preserve the rr/fh-style "=1" URL
  // convention rather than the comma-csv pattern useMultiUrlState writes.
  const searchParams = useSearchParams();
  const dupActive = searchParams.get("dup") === "1";
  function toggleDupChip() {
    const params = new URLSearchParams(searchParams.toString());
    if (dupActive) {
      params.delete("dup");
    } else {
      params.set("dup", "1");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${base}?${qs}` : base);
    });
  }

  // PP5-D-A: bank-side duplicate review dialog mount state. Single instance
  // shared across all rows; per-row badges fire openDuplicateDialog(row).
  const [duplicateDialogPayload, setDuplicateDialogPayload] = useState<
    BankDuplicateReviewPayload | null
  >(null);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);

  function openDuplicateDialog(row: ReconciliationQueueRow) {
    if (!row.duplicate_metadata || !row.duplicate_status) return;
    setDuplicateDialogPayload({
      bank_transaction_id: row.id,
      subdivision_id: subdivisionId,
      current: {
        transaction_date: row.transaction_date,
        amount: row.amount,
        description: row.description,
        source: row.source,
      },
      duplicate_metadata: row.duplicate_metadata,
      // No candidate snapshot — the matched_against id surfaces in metadata.
      // Future PP5-D-A++: pre-fetch candidate snapshot server-side.
      candidate: null,
      duplicate_status: row.duplicate_status,
      match_status: row.match_status,
      matched_total: row.matched_total,
    });
    setDuplicateDialogOpen(true);
  }

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (queue.bankAccounts.length > 0) {
                setSelectedBankAccount(queue.bankAccounts[0]);
                setRecordReceiptOpen(true);
              }
            }}
            disabled={queue.bankAccounts.length === 0}
          >
            <Upload className="mr-2 h-4 w-4" />
            Record receipt
          </Button>
          <Link href={`/subdivisions/${subdivisionCode}/bank-account`}>
            <Button variant="outline" size="sm">
              <FileText className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => {
              if (queue.bankAccounts.length > 0) {
                setSelectedBankAccount(queue.bankAccounts[0]);
                setAddManualTxnOpen(true);
              }
            }}
            disabled={queue.bankAccounts.length === 0}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add manual transaction
          </Button>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 mt-4 border-t border-border">
            <FilterChips
              label="Match confidence"
              options={MATCH_CONFIDENCE_OPTIONS.map((o) => ({ ...o }))}
              value={matchConfidence}
              onChange={setMatchConfidence}
            />
            <FilterChips
              label="Match method"
              options={MATCH_METHOD_OPTIONS.map((o) => ({ ...o }))}
              value={matchMethod}
              onChange={setMatchMethod}
            />
          </div>

          {/* PP5-D-A: single-bool toggle chip styled to match FilterChips. */}
          <div className="pt-4 mt-4 border-t border-border space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Review surface
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={dupActive}
                onClick={toggleDupChip}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  dupActive
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                Possible duplicate
              </button>
            </div>
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
                      onOpenAuditDrawer={openAuditDrawer}
                      onOpenDuplicateDialog={openDuplicateDialog}
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

      <MatchMetadataDrawer
        open={auditTxId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAuditTxId(null);
            setAuditPayload(undefined);
          }
        }}
        audit={auditPayload}
        bankTxnDescription={
          auditTxId
            ? rows.find((r) => r.id === auditTxId)?.description ?? undefined
            : undefined
        }
      />

      {/* PP5-D-A: bank-side duplicate review dialog (single shared instance). */}
      <BankDuplicateReviewDialog
        open={duplicateDialogOpen}
        onOpenChange={(open) => {
          setDuplicateDialogOpen(open);
          if (!open) setDuplicateDialogPayload(null);
        }}
        payload={duplicateDialogPayload}
        subdivisionCode={subdivisionCode}
        onResolved={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* Dialogs */}
      {selectedBankAccount && (
        <>
          <AddManualTransactionDialog
            open={addManualTxnOpen}
            onOpenChange={setAddManualTxnOpen}
            subdivisionId={subdivisionId}
            bankAccountId={selectedBankAccount.id}
            bankAccountName={selectedBankAccount.name}
            onSuccess={() => {
              startTransition(() => {
                router.refresh();
              });
            }}
          />
          <RecordCashReceiptDialog
            open={recordReceiptOpen}
            onOpenChange={setRecordReceiptOpen}
            subdivisionId={subdivisionId}
            bankAccountId={selectedBankAccount.id}
            bankAccountName={selectedBankAccount.name}
            fundType={selectedBankAccount.fund_type}
            onSuccess={() => {
              startTransition(() => {
                router.refresh();
              });
            }}
          />
        </>
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
  onOpenAuditDrawer,
  onOpenDuplicateDialog,
}: {
  row: ReconciliationQueueRow;
  subdivisionId: string;
  onOpenAuditDrawer: (bankTxnId: string) => void;
  onOpenDuplicateDialog: (row: ReconciliationQueueRow) => void;
}) {
  void subdivisionId;
  const subdivisionCode = useSubdivisionCode();
  const href = `/subdivisions/${subdivisionCode}/reconciliation/${row.id}`;
  const isCredit = row.amount > 0;
  const amountClass = isCredit ? "text-[hsl(160,100%,37%)]" : "text-destructive";

  // PP5-D-A priority rule (per PP5-D-0 ratification):
  // when a row has BOTH duplicate_status='suspected' AND a fuzzy hint,
  // suppress the FuzzyHintCell — duplicate review takes precedence.
  // Both surface UI affordances; rendering both creates conflicting CTAs.
  const showFuzzyHint = row.duplicate_status !== "suspected" && !!row.fuzzy_hint;
  const showDuplicateBadge = row.duplicate_status === "suspected" && !!row.duplicate_metadata;

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">{formatDate(row.transaction_date)}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge variant="neutral">
          {SOURCE_LABEL[row.source] ?? row.source}
        </Badge>
      </td>
      <td className="px-4 py-3 max-w-[32rem]">
        <FuzzyHintCell
          description={row.description}
          hint={showFuzzyHint ? row.fuzzy_hint : null}
          detailHref={href}
        />
        <Link
          href={href}
          className="text-xs text-muted-foreground mt-0.5 inline-block hover:text-foreground hover:underline underline-offset-2"
        >
          {row.detected_reference
            ? `Ref ${row.detected_reference} · ${row.bank_account_name}`
            : row.bank_account_name}
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
        <div className="flex items-center gap-2">
          <MatchStatusBadge
            status={row.match_status}
            isVoided={row.is_voided}
            matchedTotal={row.matched_total}
            amount={row.amount}
          />
          {showDuplicateBadge && (
            <DuplicateBadge onClick={() => onOpenDuplicateDialog(row)} />
          )}
          {row.match_summary?.review_required && (
            <ReviewSuggestedBadge
              onClick={() => onOpenAuditDrawer(row.id)}
            />
          )}
        </div>
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
  void subdivisionId;
  const subdivisionCode = useSubdivisionCode();
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
            <Link href={`/subdivisions/${subdivisionCode}/bank-account`}>
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
