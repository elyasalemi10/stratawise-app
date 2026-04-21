"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Check, Upload, Landmark, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateSubdivisionField } from "../../manage/actions";
import { getBankTransactions } from "@/lib/actions/bank-transactions";
import type { BankAccountSummary, BankTransactionRecord } from "@/lib/validations/bank-transactions";
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
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-foreground mb-4">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Automatic bank feeds coming soon</div>
            <div className="text-muted-foreground mt-0.5">
              While we finalise Basiq integration, export a CSV from your bank and import it here.
              Transactions with a levy reference (e.g. <span className="font-mono">LEV-2026-000001</span>) in the description are auto-matched.
            </div>
          </div>
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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const txs = await getBankTransactions(subdivisionId, account.id);
        setTransactions(txs);
      } catch {
        setTransactions([]);
      }
    });
  }, [subdivisionId, account.id, account.transaction_count, account.last_transaction_date]);

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
          <Button size="sm" onClick={onImport} className="cursor-pointer shrink-0">
            <Upload className="mr-2 h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-5">
          <Metric label="Current balance" value={formatCurrency(account.current_balance)} primary />
          <Metric label="Opening balance" value={formatCurrency(account.opening_balance)} sub={account.opening_balance_date ? `as at ${formatDate(account.opening_balance_date)}` : undefined} />
          <Metric label="Transactions" value={account.transaction_count.toString()} sub={account.last_transaction_date ? `latest ${formatDate(account.last_transaction_date)}` : "none imported"} />
        </div>

        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Recent transactions</div>
        {isPending && transactions === null ? (
          <TransactionsSkeleton />
        ) : transactions && transactions.length > 0 ? (
          <TransactionsTable transactions={transactions} />
        ) : (
          <div className="rounded-md border border-border bg-muted/30 py-8 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Import a CSV to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
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

function TransactionsTable({ transactions }: { transactions: BankTransactionRecord[] }) {
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
          {transactions.map((t) => (
            <tr key={t.id} className="border-t border-border hover:bg-muted/30">
              <td className="px-3 py-2 tabular-nums text-foreground">{formatDate(t.transaction_date)}</td>
              <td className="px-3 py-2 text-foreground max-w-md truncate" title={t.description ?? ""}>
                {t.description || <span className="text-muted-foreground italic">—</span>}
              </td>
              <td className="px-3 py-2">
                <MatchBadge tx={t} />
              </td>
              <td className={cn("px-3 py-2 text-right tabular-nums font-medium", t.amount < 0 ? "text-destructive" : "text-secondary")}>
                {formatCurrency(t.amount)}
              </td>
            </tr>
          ))}
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
