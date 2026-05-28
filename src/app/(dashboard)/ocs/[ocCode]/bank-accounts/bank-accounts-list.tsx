"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Plus, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AUSTRALIAN_BANKS } from "@/lib/data/australian-banks";
import { ImportCsvDialog } from "./import-csv-dialog";
import { AddBankAccountDrawer } from "./add-bank-account-drawer";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

interface BankAccountRow {
  id: string;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  bank_name: string | null;
  fund_labels: string[];
  transactions: Array<{
    id: string;
    date: string | null;
    description: string;
    amount: number | null;
    balance: number | null;
  }>;
}

function logoFor(bankName: string | null | undefined): string | null {
  if (!bankName) return null;
  return AUSTRALIAN_BANKS.find(
    (b) => b.name.toLowerCase() === bankName.toLowerCase(),
  )?.logo ?? null;
}

export function BankAccountsList({
  ocId,
  accounts,
}: {
  ocId: string;
  accounts: BankAccountRow[];
}) {
  const router = useRouter();
  const [importTarget, setImportTarget] = useState<BankAccountRow | null>(null);
  const [activeTab, setActiveTab] = useState<string>(accounts[0]?.id ?? "");
  const [addOpen, setAddOpen] = useState(false);

  function switchTab(next: string) {
    setActiveTab(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={switchTab}>
        <div className="flex items-center justify-between">
          <TabsList
            variant="line"
            className="h-auto flex-wrap justify-start gap-2 border-0 bg-transparent p-0"
          >
            {accounts.map((a) => {
              const logo = logoFor(a.bank_name);
              return (
                <TabsTrigger
                  key={a.id}
                  value={a.id}
                  className="relative h-11 min-w-[6.5rem] rounded-none border-0 px-4 text-sm font-medium text-muted-foreground bg-transparent transition-colors hover:text-foreground hover:bg-transparent data-active:bg-transparent data-active:text-foreground data-active:after:bg-[color:var(--brand-gold)] data-active:after:rounded-full inline-flex items-center gap-2"
                >
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="" width={18} height={18} className="rounded shrink-0" />
                  ) : (
                    <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
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
            <div className="rounded-md border border-border bg-card p-5 space-y-5">
              <div className="flex items-center justify-end">
                <Button onClick={() => setImportTarget(a)}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Import CSV
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-border pt-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {a.fund_labels.length > 1 ? "Funds" : "Fund"}
                  </p>
                  <p className="text-sm text-foreground mt-1">
                    {a.fund_labels.length > 0 ? a.fund_labels.join(", ") : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">BSB</p>
                  <p className="text-sm text-foreground mt-1">{a.bsb || ""}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account number</p>
                  <p className="text-sm text-foreground mt-1">{a.account_number || ""}</p>
                </div>
              </div>

              {/* Transactions , appended on each CSV import. No dedup;
                  managers re-upload whenever they want a fresh snapshot,
                  duplicate rows are visible and can be deleted manually. */}
              <div className="border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Transactions</p>
                {a.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transactions imported yet. Use "Import CSV" to add a bank statement.</p>
                ) : (
                  <div className="overflow-hidden rounded-md border border-border">
                    <Table variant="striped">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[110px]">Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[130px] text-right">Amount</TableHead>
                          <TableHead className="w-[140px] text-right">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {a.transactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-foreground text-xs">{formatDate(t.date)}</TableCell>
                            <TableCell className="text-foreground text-xs">{t.description}</TableCell>
                            <TableCell className={`text-right tabular-nums text-xs ${t.amount !== null && t.amount < 0 ? "text-destructive" : "text-foreground"}`}>
                              {t.amount !== null ? formatCurrency(t.amount) : ""}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs text-foreground">
                              {t.balance !== null ? formatCurrency(t.balance) : ""}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {importTarget && (
        <ImportCsvDialog
          ocId={ocId}
          account={importTarget}
          open={!!importTarget}
          onOpenChange={(o) => {
            if (!o) {
              setImportTarget(null);
              router.refresh();
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
          router.refresh();
        }}
      />
    </div>
  );
}
