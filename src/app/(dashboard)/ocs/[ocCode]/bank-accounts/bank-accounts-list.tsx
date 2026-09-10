"use client";

import { useState } from "react";
import { refetchCached } from "@/lib/use-cached-data";
import { Upload, Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AUSTRALIAN_BANKS, bankFromBsb } from "@/lib/data/australian-banks";
import { ImportCsvDialog } from "./import-csv-dialog";
import { TransactionLedger, type LedgerTxn } from "./transaction-ledger";
import type { EntityKind, EntityOption } from "./data";
import { AddBankAccountDrawer } from "./add-bank-account-drawer";
import { deleteBankAccount } from "./actions";

interface BankAccountRow {
  id: string;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  bank_name: string | null;
  fund_labels: string[];
  transactions: LedgerTxn[];
}

// The BSB identifies the institution, so the badge is derived. Rows created
// before we stopped asking may carry a bank_name; use it as a fallback so
// their logo does not disappear.
function logoFor(bsb: string | null | undefined, bankName: string | null | undefined): string | null {
  const fromBsb = bankFromBsb(bsb)?.logo;
  if (fromBsb) return fromBsb;
  if (!bankName) return null;
  return AUSTRALIAN_BANKS.find(
    (b) => b.name.toLowerCase() === bankName.toLowerCase(),
  )?.logo ?? null;
}

export function BankAccountsList({
  ocId,
  accounts,
  entityOptions,
  onAssign,
}: {
  ocId: string;
  accounts: BankAccountRow[];
  entityOptions: EntityOption[];
  onAssign: (txnId: string, entity: { kind: EntityKind; id: string } | null) => void;
}) {
  const [importTarget, setImportTarget] = useState<BankAccountRow | null>(null);
  const [activeTab, setActiveTab] = useState<string>(accounts[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function switchTab(next: string) {
    setActiveTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteBankAccount(ocId, deleteTarget.id);
    if (res.error) {
      setDeleting(false);
      toast.error(res.error);
      return;
    }
    // Move to the account that just became primary BEFORE the refresh, so
    // the tab strip never points at the row that's about to disappear.
    const promoted = res.promotedAccountId ?? accounts.find((a) => a.id !== deleteTarget.id)?.id ?? "";
    switchTab(promoted);
    setDeleteTarget(null);
    setDeleting(false);
    toast.success("Bank account deleted");
    refetchCached("bank-accounts:");
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={switchTab}>
        <div className="flex items-center justify-between">
          <TabsList
            variant="line"
            className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0"
          >
            {accounts.map((a) => {
              const logo = logoFor(a.bsb, a.bank_name);
              return (
                <TabsTrigger
                  key={a.id}
                  value={a.id}
                  className="relative h-11 min-w-[6.5rem] rounded-none border-0 px-4 text-sm font-medium text-muted-foreground bg-transparent transition-colors hover:text-foreground hover:bg-transparent data-active:bg-transparent data-active:text-foreground data-active:after:inset-x-0 data-active:after:bottom-0 data-active:after:h-0.5 data-active:after:bg-[color:var(--brand-gold)] inline-flex items-center gap-2"
                >
                  {/* No badge when the BSB is not one we recognise. A
                      placeholder that looks like a bank logo, on a row where
                      we do not know the bank, is worse than nothing. */}
                  {logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" width={18} height={18} className="rounded shrink-0" />
                  )}
                  {a.account_name || a.bank_name || "Bank account"}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add bank account"
            className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {accounts.map((a) => (
          <TabsContent key={a.id} value={a.id} className="mt-4">
            <AccountPane
              ocId={ocId}
              account={a}
              entityOptions={entityOptions}
              onAssign={onAssign}
              onImport={() => setImportTarget(a)}
              // An OC must keep one account , levies have to name somewhere
              // to be paid. With only one left there's nothing to delete to.
              onDelete={accounts.length > 1 ? () => setDeleteTarget(a) : undefined}
            />
          </TabsContent>
        ))}
      </Tabs>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete this bank account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.account_name || "This account"} and every transaction
              imported into it will be removed. The remaining account becomes the
              Owners Corporation&apos;s primary operating account and will be shown
              on new levy notices. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {importTarget && (
        <ImportCsvDialog
          ocId={ocId}
          account={importTarget}
          open={!!importTarget}
          onOpenChange={(o) => {
            if (!o) {
              setImportTarget(null);
              refetchCached("bank-accounts:");
            }
          }}
        />
      )}

      <AddBankAccountDrawer
        ocId={ocId}
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          setAddOpen(false);
          refetchCached("bank-accounts:");
        }}
      />
    </div>
  );
}

function AccountPane({
  ocId,
  account,
  entityOptions,
  onAssign,
  onImport,
  onDelete,
}: {
  ocId: string;
  account: BankAccountRow;
  entityOptions: EntityOption[];
  onAssign: (txnId: string, entity: { kind: EntityKind; id: string } | null) => void;
  onImport: () => void;
  /** Omitted when this is the OC's last account , nothing to fall back to. */
  onDelete?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-md border border-border bg-card p-5">
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium tracking-normal text-muted-foreground">
              {account.fund_labels.length > 1 ? "Funds" : "Fund"}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {account.fund_labels.length > 0 ? account.fund_labels.join(", ") : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-normal text-muted-foreground">BSB</p>
            <p className="mt-1 text-sm text-foreground">{account.bsb || ""}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-normal text-muted-foreground">
              Account number
            </p>
            <p className="mt-1 text-sm text-foreground">{account.account_number || ""}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDelete && (
            <Button
              variant="secondary"
              onClick={onDelete}
              className="text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete account
            </Button>
          )}
          <Button onClick={onImport}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import CSV
          </Button>
        </div>
      </div>

      <TransactionLedger
        ocId={ocId}
        transactions={account.transactions}
        entityOptions={entityOptions}
        onAssign={onAssign}
      />
    </div>
  );
}
