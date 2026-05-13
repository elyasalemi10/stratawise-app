"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { Wallet, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getLotBalance, getLotLedgerEntries, getLedgerPaymentSourceLinks, voidLedgerEntry } from "@/lib/actions/ledger";
import { getBankAccountsForOC } from "@/lib/actions/bank-transactions";
import { RecordCashReceiptDialog } from "@/components/shared/record-cash-receipt-dialog";
import { RecordAdjustmentDialog } from "@/components/shared/record-adjustment-dialog";
import { DuplicateBadge } from "@/components/shared/duplicate-badge";
import {
  LedgerDuplicateReviewDialog,
  type LedgerDuplicateReviewPayload,
} from "@/components/reconciliation/ledger-duplicate-review-dialog";
import { LedgerEntryDrawer } from "./lot-ledger-drawer";
import type { LotLedgerState, LotLedgerEntry, LedgerEntryCategory, FundType, LedgerSourceLink } from "@/lib/validations/ledger";
import type { BankAccountSummary } from "@/lib/validations/bank-transactions";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const CATEGORY_LABELS: Record<LedgerEntryCategory, string> = {
  levy: "Levy",
  special_levy: "Special levy",
  interest: "Interest",
  payment: "Payment",
  writeoff: "Write-off",
  adjustment_debit: "Debit adjustment",
  adjustment_credit: "Credit adjustment",
  refund: "Refund",
  void_offset: "Void offset",
};

const CATEGORY_FILTER_OPTIONS: { value: LedgerEntryCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "levy", label: "Levy" },
  { value: "special_levy", label: "Special levy" },
  { value: "interest", label: "Interest" },
  { value: "payment", label: "Payment" },
  { value: "writeoff", label: "Write-off" },
  { value: "adjustment_debit", label: "Debit adjustment" },
  { value: "adjustment_credit", label: "Credit adjustment" },
  { value: "refund", label: "Refund" },
  { value: "void_offset", label: "Void offset" },
];

function canVoid(
  entry: LotLedgerEntry,
  sourceLink?: LedgerSourceLink,
): { allowed: boolean; reason?: string; linkHref?: string } {
  if (entry.status === "voided") return { allowed: false };
  if (entry.category === "void_offset") return { allowed: false };
  if (entry.category === "payment" && entry.entry_type === "credit") {
    if (sourceLink?.bankTxnId) {
      return {
        allowed: false,
        reason: "To reverse this payment, unmatch the bank transaction.",
        linkHref: `/ocs/${entry.oc_id}/reconciliation/${sourceLink.bankTxnId}`,
      };
    }
    if (sourceLink?.receiptId) {
      return {
        allowed: false,
        reason: "To reverse this payment, void the underlying cash receipt.",
        linkHref: `/ocs/${entry.oc_id}/bank-account`,
      };
    }
    return {
      allowed: false,
      reason:
        "Payment credits can't be voided directly. To reverse, use the reconciliation queue.",
    };
  }
  return { allowed: true };
}

// ─── Void entry dialog ──────────────────────────────────────────

const voidEntrySchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(1000),
});
type VoidEntryInput = z.infer<typeof voidEntrySchema>;

function VoidEntryDialog({
  entry,
  onClose,
  onSuccess,
}: {
  entry: LotLedgerEntry;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLevyType =
    entry.category === "levy" || entry.category === "special_levy";

  const form = useForm<VoidEntryInput>({
    resolver: zodResolver(voidEntrySchema),
    defaultValues: { reason: "" },
  });

  const onSubmit = async (data: VoidEntryInput) => {
    setIsSubmitting(true);
    try {
      const result = await voidLedgerEntry(entry.id, data.reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Entry voided");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void entry");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Void entry</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Void {CATEGORY_LABELS[entry.category]} of {formatCurrency(entry.amount)} on{" "}
          {formatDate(entry.entry_date)}. This will create a reversing entry and cannot be undone.
        </p>
        {isLevyType && entry.reference && (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
            <Info className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
            <span>
              This will also mark levy notice{" "}
              <span className="font-medium">{entry.reference}</span> as written off.
            </span>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for voiding</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="E.g. Entered in error, duplicate entry..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmitting} className="cursor-pointer">
                {isSubmitting ? "Voiding..." : "Void entry"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────

function LedgerSkeleton() {
  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {["Administrative fund balance", "Capital works balance", "Oldest unpaid (admin)", "Oldest unpaid (capital works)"].map((label) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              <div className="mt-2 h-7 w-28 rounded bg-muted animate-pulse" />
              <div className="mt-1.5 h-3 w-16 rounded bg-muted animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Action row */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-44 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
      </div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
        <div className="h-5 w-28 rounded bg-muted animate-pulse" />
      </div>
      {/* Table */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Date", "Type", "Category", "Description", "Reference", "Amount", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /></td>
                <td className="px-3 py-2"><div className="h-5 w-14 rounded-full bg-muted animate-pulse" /></td>
                <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /></td>
                <td className="px-3 py-2"><div className="h-3 w-40 rounded bg-muted animate-pulse" /></td>
                <td className="px-3 py-2"><div className="h-3 w-32 rounded bg-muted animate-pulse" /></td>
                <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse ml-auto" /></td>
                <td className="px-3 py-2"><div className="h-5 w-12 rounded-full bg-muted animate-pulse" /></td>
                <td className="px-3 py-2"><div className="h-7 w-14 rounded bg-muted animate-pulse" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────

export function LedgerTab({
  ocId,
  lotId,
}: {
  ocId: string;
  lotId: string;
}) {
  const [balance, setBalance] = useState<LotLedgerState | null>(null);
  const [entries, setEntries] = useState<LotLedgerEntry[] | null>(null);
  const [sourceLinks, setSourceLinks] = useState<Record<string, LedgerSourceLink>>({});
  const [bankAccounts, setBankAccounts] = useState<BankAccountSummary[]>([]);
  const [isPending, startTransition] = useTransition();
  const [refreshToken, setRefreshToken] = useState(0);

  // Filters
  const [fundFilter, setFundFilter] = useState<"all" | FundType>("administrative");
  const [categoryFilter, setCategoryFilter] = useState<LedgerEntryCategory | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeVoided, setIncludeVoided] = useState(false);

  // Dialogs + drawer
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<LotLedgerEntry | null>(null);
  const [drawerEntryId, setDrawerEntryId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // PP5-D-B: ledger-side duplicate review dialog mount state. Single
  // shared instance for the whole tab; per-row badges fire openLedgerDup(entry).
  const [ledgerDupOpen, setLedgerDupOpen] = useState(false);
  const [ledgerDupPayload, setLedgerDupPayload] =
    useState<LedgerDuplicateReviewPayload | null>(null);

  function openLedgerDup(entry: LotLedgerEntry) {
    if (!entry.duplicate_metadata || !entry.duplicate_status) return;
    // The detector's metadata shape (from PP5-B). Defensive cast — Zod
    // schema source-of-truth lives in validations/reconciliation.ts.
    const meta = entry.duplicate_metadata as {
      matched_against?: string;
      lot_id?: string;
      levy_notice_id?: string;
      amount?: number;
      day_delta?: number;
      older_category?: string;
      newer_category?: string;
    };
    if (
      !meta.matched_against ||
      !meta.lot_id ||
      !meta.levy_notice_id ||
      typeof meta.amount !== "number" ||
      typeof meta.day_delta !== "number" ||
      !meta.older_category ||
      !meta.newer_category
    ) {
      return;
    }
    setLedgerDupPayload({
      lot_ledger_entry_id: entry.id,
      oc_id: entry.oc_id,
      current: {
        entry_date: entry.entry_date,
        amount: entry.amount,
        fund_type: entry.fund_type,
        levy_notice_id: entry.levy_notice_id,
        description: entry.description,
      },
      duplicate_metadata: {
        matched_against: meta.matched_against,
        lot_id: meta.lot_id,
        levy_notice_id: meta.levy_notice_id,
        amount: meta.amount,
        day_delta: meta.day_delta,
        older_category: meta.older_category,
        newer_category: meta.newer_category,
      },
      duplicate_status: entry.duplicate_status,
      parent_status: entry.parent_status,
    });
    setLedgerDupOpen(true);
  }

  const refresh = () => setRefreshToken((n) => n + 1);

  useEffect(() => {
    startTransition(async () => {
      try {
        const [bal, ents, accts, links] = await Promise.all([
          getLotBalance(lotId),
          getLotLedgerEntries(lotId, {
            limit: 500,
            status: includeVoided ? null : "active",
          }),
          getBankAccountsForOC(ocId),
          getLedgerPaymentSourceLinks(lotId),
        ]);
        setBalance(bal);
        setEntries(ents);
        setBankAccounts(accts);
        setSourceLinks(links);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load ledger");
        setEntries([]);
      }
    });
  }, [lotId, ocId, includeVoided, refreshToken]);

  // Determine bank account for receipt dialog: match fund filter, default admin, first if none
  const receiptBankAccount =
    bankAccounts.find(
      (a) => a.fund_type === (fundFilter === "all" ? "administrative" : fundFilter),
    ) ?? bankAccounts[0] ?? null;

  // Client-side filtering
  const visible = (entries ?? []).filter((e) => {
    if (fundFilter !== "all" && e.fund_type !== fundFilter) return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (dateFrom && e.entry_date < dateFrom) return false;
    if (dateTo && e.entry_date > dateTo) return false;
    return true;
  });

  // Running balance per fund (oldest-first cumulative; negative = owes)
  const runningBalMap = new Map<string, number>();
  if (fundFilter !== "all") {
    const fundEntries = [...(entries ?? [])]
      .filter((e) => e.fund_type === fundFilter)
      .sort(
        (a, b) =>
          a.entry_date.localeCompare(b.entry_date) ||
          a.created_at.localeCompare(b.created_at),
      );
    let running = 0;
    for (const e of fundEntries) {
      running += e.entry_type === "credit" ? e.amount : -e.amount;
      runningBalMap.set(e.id, running);
    }
  }

  const capped = entries !== null && entries.length === 500;

  const clearFilters = () => {
    setCategoryFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const filtersActive =
    categoryFilter !== "all" || dateFrom !== "" || dateTo !== "";

  if (isPending && entries === null) {
    return <LedgerSkeleton />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard
            label="Administrative fund balance"
            value={balance ? formatCurrency(balance.admin_balance) : "—"}
            negative={balance ? balance.admin_balance < 0 : false}
            sub={balance?.admin_balance === 0 ? "Current" : balance && balance.admin_balance < 0 ? "In arrears" : balance && balance.admin_balance > 0 ? "Credit balance" : undefined}
          />
          <KpiCard
            label="Capital works balance"
            value={balance ? formatCurrency(balance.capital_balance) : "—"}
            negative={balance ? balance.capital_balance < 0 : false}
            sub={balance?.capital_balance === 0 ? "Current" : balance && balance.capital_balance < 0 ? "In arrears" : balance && balance.capital_balance > 0 ? "Credit balance" : undefined}
          />
          <KpiCard
            label="Oldest unpaid (admin)"
            value={balance?.oldest_unpaid_date_admin ? formatDate(balance.oldest_unpaid_date_admin) : "None"}
            negative={!!balance?.oldest_unpaid_date_admin}
          />
          <KpiCard
            label="Oldest unpaid (capital works)"
            value={balance?.oldest_unpaid_date_capital ? formatDate(balance.oldest_unpaid_date_capital) : "None"}
            negative={!!balance?.oldest_unpaid_date_capital}
          />
        </div>

        {/* PP6-D-A: lifetime interest accrued summary. Uses
            lot_ledger_entries.category='interest' SUM (already-indexed) per
            PP6-D-0 SG-D6. Renders only when at least one ACTIVE INTEREST
            DEBIT exists — predicate matches the reduce filter exactly so a
            lot with only credits / voided debits doesn't render an empty
            $0.00 card. */}
        {(() => {
          const isActiveInterestDebit = (e: LotLedgerEntry) =>
            e.category === "interest" &&
            e.entry_type === "debit" &&
            e.status === "active";
          if (!entries || !entries.some(isActiveInterestDebit)) return null;
          const total = entries
            .filter(isActiveInterestDebit)
            .reduce((s, e) => s + Number(e.amount), 0);
          return (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total interest accrued (lifetime)
              </span>
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(total)}
              </span>
            </div>
          );
        })()}

        {/* Action row */}
        <div className="flex items-center gap-3">
          {receiptBankAccount ? (
            <Button
              size="sm"
              onClick={() => setReceiptDialogOpen(true)}
              className="cursor-pointer"
            >
              Record cash receipt
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span />}>
                <Button size="sm" disabled>
                  Record cash receipt
                </Button>
              </TooltipTrigger>
              <TooltipContent>No bank accounts configured for this OC.</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdjustmentDialogOpen(true)}
            className="cursor-pointer"
          >
            Record adjustment
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <Select value={fundFilter} onValueChange={(v) => setFundFilter(v as typeof fundFilter)}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All funds</SelectItem>
              <SelectItem value="administrative">Administrative fund</SelectItem>
              <SelectItem value="capital_works">Capital works fund</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
            <SelectTrigger className="h-9 w-44 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="include-voided"
              checked={includeVoided}
              onCheckedChange={setIncludeVoided}
            />
            <Label htmlFor="include-voided" className="text-sm cursor-pointer">
              Include voided
            </Label>
          </div>
        </div>

        {/* Running balance note for "All funds" */}
        {fundFilter === "all" && (entries ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Select a fund to view running balance.
          </p>
        )}

        {/* 500-entry cap warning */}
        {capped && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
            <Info className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
            Showing 500 most recent entries. Running balance reflects these only.
          </div>
        )}

        {/* Empty state */}
        {entries !== null && entries.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No ledger activity yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Ledger entries appear here when levies are issued or payments are recorded.
              </p>
              <div className="flex items-center gap-3">
                {receiptBankAccount && (
                  <Button size="sm" onClick={() => setReceiptDialogOpen(true)} className="cursor-pointer">
                    Record cash receipt
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setAdjustmentDialogOpen(true)} className="cursor-pointer">
                  Record adjustment
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtered empty state */}
        {entries !== null && entries.length > 0 && visible.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No entries match the current filters.
              </p>
              {filtersActive && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="cursor-pointer">
                  Clear filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Entries table */}
        {visible.length > 0 && (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-24">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-32">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-40">Reference</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Amount</th>
                  {fundFilter !== "all" && (
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Balance</th>
                  )}
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-20">Status</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {visible.map((entry) => {
                  const voided = entry.status === "voided";
                  const voidCheck = canVoid(entry, sourceLinks[entry.id]);
                  const runBal = runningBalMap.get(entry.id);
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        "border-t border-border hover:bg-muted/30",
                        voided && "opacity-50",
                      )}
                    >
                      <td className={cn("px-3 py-2 tabular-nums text-foreground", voided && "line-through")}>
                        {formatDate(entry.entry_date)}
                      </td>
                      <td className="px-3 py-2">
                        {entry.entry_type === "credit" ? (
                          <Badge className="rounded-full bg-secondary/10 text-secondary hover:bg-secondary/10">
                            Credit
                          </Badge>
                        ) : (
                          <Badge className="rounded-full bg-destructive/10 text-destructive hover:bg-destructive/10">
                            Debit
                          </Badge>
                        )}
                      </td>
                      <td className={cn("px-3 py-2 text-foreground", voided && "line-through")}>
                        {CATEGORY_LABELS[entry.category]}
                      </td>
                      <td className={cn("px-3 py-2 text-foreground max-w-xs truncate", voided && "line-through")} title={entry.description ?? ""}>
                        {entry.description || <span className="text-muted-foreground italic">—</span>}
                      </td>
                      <td className={cn("px-3 py-2 font-mono text-xs text-foreground", voided && "line-through")}>
                        {entry.reference || <span className="text-muted-foreground font-sans not-italic">—</span>}
                      </td>
                      <td className={cn(
                        "px-3 py-2 text-right tabular-nums font-medium",
                        voided ? "text-muted-foreground" : entry.entry_type === "credit" ? "text-secondary" : "text-destructive",
                        voided && "line-through",
                      )}>
                        {entry.entry_type === "debit" ? "-" : "+"}{formatCurrency(entry.amount)}
                      </td>
                      {fundFilter !== "all" && (
                        <td className={cn(
                          "px-3 py-2 text-right tabular-nums font-medium",
                          runBal !== undefined && runBal < 0 ? "text-destructive" : "text-secondary",
                        )}>
                          {runBal !== undefined ? formatCurrency(runBal) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {voided ? (
                            <Badge className="rounded-full bg-muted text-muted-foreground hover:bg-muted">
                              Voided
                            </Badge>
                          ) : (
                            <Badge className="rounded-full bg-secondary/10 text-secondary hover:bg-secondary/10">
                              Active
                            </Badge>
                          )}
                          {entry.duplicate_status === "suspected" &&
                            entry.duplicate_metadata && (
                              <DuplicateBadge onClick={() => openLedgerDup(entry)} />
                            )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs cursor-pointer"
                            onClick={() => { setDrawerEntryId(entry.id); setDrawerOpen(true); }}
                          >
                            View
                          </Button>
                          {!voided && entry.category !== "void_offset" && (
                            voidCheck.allowed ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/5 cursor-pointer"
                                onClick={() => setVoidTarget(entry)}
                              >
                                Void
                              </Button>
                            ) : voidCheck.reason ? (
                              <Tooltip>
                                <TooltipTrigger render={<span />}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground cursor-not-allowed"
                                    disabled
                                  >
                                    Void
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  {voidCheck.linkHref ? (
                                    <span>
                                      {voidCheck.reason}{" "}
                                      <Link href={voidCheck.linkHref} className="underline">
                                        Go →
                                      </Link>
                                    </span>
                                  ) : (
                                    voidCheck.reason
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            ) : null
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Dialogs */}
        {receiptBankAccount && (
          <RecordCashReceiptDialog
            open={receiptDialogOpen}
            onOpenChange={setReceiptDialogOpen}
            ocId={ocId}
            bankAccountId={receiptBankAccount.id}
            bankAccountName={receiptBankAccount.bank_name ?? "Bank account"}
            fundType={receiptBankAccount.fund_type}
            defaultLotId={lotId}
            onSuccess={refresh}
          />
        )}

        <RecordAdjustmentDialog
          open={adjustmentDialogOpen}
          onOpenChange={setAdjustmentDialogOpen}
          ocId={ocId}
          defaultLotId={lotId}
          onSuccess={refresh}
        />

        {voidTarget && (
          <VoidEntryDialog
            entry={voidTarget}
            onClose={() => setVoidTarget(null)}
            onSuccess={() => {
              setVoidTarget(null);
              refresh();
            }}
          />
        )}

        <LedgerEntryDrawer
          entryId={drawerEntryId}
          ocId={ocId}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />

        {/* PP5-D-B: ledger-side duplicate review dialog (single shared instance). */}
        <LedgerDuplicateReviewDialog
          open={ledgerDupOpen}
          onOpenChange={(open) => {
            setLedgerDupOpen(open);
            if (!open) setLedgerDupPayload(null);
          }}
          payload={ledgerDupPayload}
          onResolved={() => {
            startTransition(() => {
              refresh();
            });
          }}
        />
      </div>
    </TooltipProvider>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  negative,
  sub,
}: {
  label: string;
  value: string;
  negative: boolean;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn(
          "mt-2 text-xl font-bold tabular-nums",
          negative ? "text-destructive" : "text-secondary",
        )}>
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
