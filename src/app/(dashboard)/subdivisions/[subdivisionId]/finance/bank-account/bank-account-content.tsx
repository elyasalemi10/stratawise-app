"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Check, Upload, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { updateSubdivisionField } from "../../manage/actions";
import { getBankTransactions } from "@/lib/actions/bank-transactions";
import { getUndepositedEntries, voidUndepositedReceipt } from "@/lib/actions/reconciliation";
import { RecordCashReceiptDialog } from "@/components/shared/record-cash-receipt-dialog";
import { AddManualTransactionDialog } from "@/components/shared/add-manual-transaction-dialog";
import { BankFeedPanel } from "./bank-feed-panel";
import type { BankAccountSummary, BankTransactionRecord } from "@/lib/validations/bank-transactions";
import type { UndepositedFundsEntry } from "@/lib/validations/reconciliation";
import { ImportCsvDialog } from "./import-csv-dialog";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const FUND_LABEL: Record<BankAccountSummary["fund_type"], string> = {
  administrative: "Administrative fund",
  capital_works: "Capital works fund",
};

export function BankAccountContent({
  subdivisionId,
  bankBsb: initialBsb,
  bankAccountNumber: initialAccountNumber,
  bankAccountName: initialAccountName,
  bankAccounts,
}: {
  subdivisionId: string;
  bankBsb: string;
  bankAccountNumber: string;
  bankAccountName: string;
  bankAccounts: BankAccountSummary[];
}) {
  const [editing, setEditing] = useState(false);
  const [bsb, setBsb] = useState(initialBsb);
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [saving, setSaving] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);

  const importAccount = bankAccounts.find((a) => a.id === importAccountId) ?? null;

  async function handleSave() {
    setSaving(true);
    const results = await Promise.all([
      updateSubdivisionField(subdivisionId, "bank_bsb", bsb || null),
      updateSubdivisionField(subdivisionId, "bank_account_number", accountNumber || null),
      updateSubdivisionField(subdivisionId, "bank_account_name", accountName || null),
    ]);
    setSaving(false);

    const error = results.find((r) => r.error);
    if (error) {
      toast.error(error.error);
    } else {
      toast.success("Bank details updated");
      setEditing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Bank account</h1>
        {editing ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setBsb(initialBsb); setAccountNumber(initialAccountNumber); setAccountName(initialAccountName); }} className="cursor-pointer">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="cursor-pointer">
              <Check className="mr-2 h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="cursor-pointer">
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">EFT details</h3>
          <p className="text-xs text-muted-foreground mb-4">These details appear on levy notices for lot owners to make payments.</p>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <Label className="text-sm text-muted-foreground w-40">BSB</Label>
              {editing ? (
                <Input value={bsb} onChange={(e) => setBsb(e.target.value)} placeholder="000-000" className="h-8 text-sm max-w-xs text-right" />
              ) : (
                <span className="text-sm font-medium text-foreground">{bsb || "Not set"}</span>
              )}
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <Label className="text-sm text-muted-foreground w-40">Account number</Label>
              {editing ? (
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345678" className="h-8 text-sm max-w-xs text-right" />
              ) : (
                <span className="text-sm font-medium text-foreground">{accountNumber || "Not set"}</span>
              )}
            </div>

            <div className="flex items-center justify-between py-2">
              <Label className="text-sm text-muted-foreground w-40">Account name</Label>
              {editing ? (
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="OC Fund Account" className="h-8 text-sm max-w-xs text-right" />
              ) : (
                <span className="text-sm font-medium text-foreground">{accountName || "Not set"}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Bank transactions</h3>
        </div>
        {bankAccounts.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Landmark className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No bank accounts configured for this subdivision.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {bankAccounts.map((account) => (
              <BankAccountCard
                key={account.id}
                subdivisionId={subdivisionId}
                account={account}
                onImport={() => setImportAccountId(account.id)}
              />
            ))}
          </div>
        )}
      </div>

      {importAccount && (
        <ImportCsvDialog
          open={!!importAccount}
          onClose={() => setImportAccountId(null)}
          subdivisionId={subdivisionId}
          bankAccountId={importAccount.id}
          fundLabel={FUND_LABEL[importAccount.fund_type]}
        />
      )}
    </div>
  );
}

function BankAccountCard({
  subdivisionId,
  account,
  onImport,
}: {
  subdivisionId: string;
  account: BankAccountSummary;
  onImport: () => void;
}) {
  const [transactions, setTransactions] = useState<BankTransactionRecord[] | null>(null);
  const [undepositedEntries, setUndepositedEntries] = useState<UndepositedFundsEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [refreshToken, setRefreshToken] = useState(0);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [manualTxnDialogOpen, setManualTxnDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<UndepositedFundsEntry | null>(null);

  const refresh = () => setRefreshToken((n) => n + 1);

  useEffect(() => {
    startTransition(async () => {
      try {
        const [txs, entries] = await Promise.all([
          getBankTransactions(subdivisionId, account.id),
          getUndepositedEntries(subdivisionId, account.id),
        ]);
        setTransactions(txs);
        setUndepositedEntries(entries);
      } catch {
        setTransactions([]);
        setUndepositedEntries([]);
      }
    });
  }, [subdivisionId, account.id, account.transaction_count, account.last_transaction_date, refreshToken]);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">{FUND_LABEL[account.fund_type]}</h4>
              <Badge className={cn(
                "rounded-full",
                account.fund_type === "administrative"
                  ? "bg-primary/10 text-primary hover:bg-primary/10"
                  : "bg-secondary/10 text-secondary hover:bg-secondary/10"
              )}>
                {account.bank_name || "Bank"}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              BSB {account.bsb || "—"} · Account {account.account_number || "—"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setReceiptDialogOpen(true)} className="cursor-pointer">
              Record cash receipt
            </Button>
            <Button variant="outline" size="sm" onClick={() => setManualTxnDialogOpen(true)} className="cursor-pointer">
              Add manual transaction
            </Button>
            <Button size="sm" onClick={onImport} className="cursor-pointer">
              <Upload className="mr-2 h-3.5 w-3.5" />
              Import CSV
            </Button>
          </div>
        </div>

        <BankFeedPanel
          subdivisionId={subdivisionId}
          bankAccountId={account.id}
        />

        <div className="grid grid-cols-3 gap-4 mb-5">
          <Metric label="Current balance" value={formatCurrency(account.current_balance)} primary />
          <Metric label="Opening balance" value={formatCurrency(account.opening_balance)} sub={account.opening_balance_date ? `as at ${formatDate(account.opening_balance_date)}` : undefined} />
          <Metric label="Transactions" value={account.transaction_count.toString()} sub={account.last_transaction_date ? `latest ${formatDate(account.last_transaction_date)}` : "none imported"} />
        </div>

        {undepositedEntries && undepositedEntries.length > 0 && (
          <UndepositedFundsPanel entries={undepositedEntries} onVoid={setVoidTarget} />
        )}

        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Recent transactions</div>
        {isPending && transactions === null ? (
          <TransactionsSkeleton />
        ) : transactions && transactions.length > 0 ? (
          <TransactionsTable
            transactions={transactions}
            undepositedEntries={undepositedEntries ?? []}
            subdivisionId={subdivisionId}
          />
        ) : (
          <div className="rounded-md border border-border bg-muted/30 py-8 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Import a CSV to get started.</p>
          </div>
        )}
      </CardContent>

      <RecordCashReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        subdivisionId={subdivisionId}
        bankAccountId={account.id}
        bankAccountName={account.bank_name ?? "Bank account"}
        fundType={account.fund_type}
        onSuccess={refresh}
      />

      <AddManualTransactionDialog
        open={manualTxnDialogOpen}
        onOpenChange={setManualTxnDialogOpen}
        subdivisionId={subdivisionId}
        bankAccountId={account.id}
        bankAccountName={account.bank_name ?? "Bank account"}
        onSuccess={refresh}
      />

      {voidTarget && (
        <VoidReceiptDialog
          entry={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => {
            setVoidTarget(null);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function UndepositedFundsPanel({
  entries,
  onVoid,
}: {
  entries: UndepositedFundsEntry[];
  onVoid: (entry: UndepositedFundsEntry) => void;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Undeposited funds</div>
        <Badge className="rounded-full bg-warning/10 text-warning hover:bg-warning/10">{entries.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Cash and cheque receipts not yet matched to a bank deposit.
      </p>
      <div className="rounded-md border border-border overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Date</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Lot</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Receipt #</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-24">Method</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Amount</th>
              <th className="px-3 py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums text-foreground">{formatDate(entry.received_date)}</td>
                <td className="px-3 py-2 text-foreground">
                  Lot {entry.lot_number}{entry.unit_number ? ` — Unit ${entry.unit_number}` : ""}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-foreground">{entry.receipt_number}</td>
                <td className="px-3 py-2 text-foreground">{entry.payment_method === "cheque" ? "Cheque" : "Cash"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-secondary">{formatCurrency(entry.amount)}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive cursor-pointer"
                    onClick={() => onVoid(entry)}
                  >
                    Void
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const voidReasonSchema = z.object({
  reason: z.string().trim().min(10, "Reason must be at least 10 characters").max(1000),
});

type VoidReasonInput = z.infer<typeof voidReasonSchema>;

function VoidReceiptDialog({
  entry,
  onClose,
  onSuccess,
}: {
  entry: UndepositedFundsEntry;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<VoidReasonInput>({
    resolver: zodResolver(voidReasonSchema),
    defaultValues: { reason: "" },
  });

  const onSubmit = async (data: VoidReasonInput) => {
    setIsSubmitting(true);
    try {
      const result = await voidUndepositedReceipt({
        subdivision_id: entry.subdivision_id,
        receipt_id: entry.id,
        reason: data.reason,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Receipt voided");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void receipt");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Void receipt</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Void {entry.receipt_number} for {formatCurrency(entry.amount)}. This will also reverse the ledger credit and cannot be undone.
        </p>
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
                      placeholder="E.g. Entered in error, cheque bounced..."
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
                {isSubmitting ? "Voiding..." : "Void receipt"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, sub, primary }: { label: string; value: string; sub?: string; primary?: boolean }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", primary ? "text-foreground" : "text-muted-foreground")}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function TransactionsSkeleton() {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Date</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-32">Status</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /></td>
              <td className="px-3 py-2"><div className="h-3 w-48 rounded bg-muted animate-pulse" /></td>
              <td className="px-3 py-2"><div className="h-3 w-16 rounded bg-muted animate-pulse" /></td>
              <td className="px-3 py-2"><div className="h-3 w-20 rounded bg-muted animate-pulse ml-auto" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTable({
  transactions,
  undepositedEntries,
  subdivisionId,
}: {
  transactions: BankTransactionRecord[];
  undepositedEntries: UndepositedFundsEntry[];
  subdivisionId: string;
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-28">Date</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground w-32">Status</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground w-32">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => {
            const matchingReceipt =
              t.match_status === "unmatched" && t.amount > 0
                ? undepositedEntries.find((e) => e.amount === t.amount)
                : undefined;
            return (
              <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums text-foreground">{formatDate(t.transaction_date)}</td>
                <td className="px-3 py-2 text-foreground max-w-md" title={t.description ?? ""}>
                  <div className="truncate">
                    {t.description || <span className="text-muted-foreground italic">—</span>}
                  </div>
                  {matchingReceipt && (
                    <div className="text-xs text-primary mt-0.5">
                      May match pending receipt {matchingReceipt.receipt_number} —{" "}
                      <Link
                        href={`/subdivisions/${subdivisionId}/finance/reconciliation/${t.id}`}
                        className="underline hover:no-underline"
                      >
                        Review
                      </Link>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <MatchBadge tx={t} />
                </td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-medium", t.amount < 0 ? "text-destructive" : "text-secondary")}>
                  {formatCurrency(t.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchBadge({ tx }: { tx: BankTransactionRecord }) {
  if (tx.match_status === "auto_matched" || tx.match_status === "manually_matched") {
    return (
      <Badge className="rounded-full bg-secondary/10 text-secondary hover:bg-secondary/10" title={tx.matched_reference ?? undefined}>
        Matched
      </Badge>
    );
  }
  if (tx.match_status === "excluded") {
    return (
      <Badge className="rounded-full bg-muted text-muted-foreground hover:bg-muted">
        Excluded
      </Badge>
    );
  }
  if (tx.matched_reference) {
    return (
      <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10" title={tx.matched_reference}>
        Ref found
      </Badge>
    );
  }
  return (
    <Badge className="rounded-full bg-muted text-muted-foreground hover:bg-muted">
      Unmatched
    </Badge>
  );
}
