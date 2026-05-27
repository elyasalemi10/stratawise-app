"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImportCsvDialog } from "./import-csv-dialog";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const formatDateLong = (iso: string | null) => {
  if (!iso) return null;
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
  current_balance: number | string | null;
  current_balance_as_of: string | null;
  /** Names of every fund this physical account funds (primary + linked
   *  children). One physical account, multiple funds. */
  fund_labels: string[];
}

export function BankAccountsList({
  ocId,
  accounts,
}: {
  ocId: string;
  accounts: BankAccountRow[];
}) {
  const [importTarget, setImportTarget] = useState<BankAccountRow | null>(null);
  const [activeTab, setActiveTab] = useState<string>(accounts[0]?.id ?? "");

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
        <TabsList
          variant="line"
          className="h-auto w-full flex-wrap justify-start gap-0 border-0 bg-transparent p-0"
        >
          {accounts.map((a) => (
            <TabsTrigger
              key={a.id}
              value={a.id}
              className="relative h-11 min-w-[6.5rem] rounded-none border-0 px-4 text-sm font-medium text-muted-foreground bg-transparent transition-colors hover:text-foreground hover:bg-transparent data-active:bg-transparent data-active:text-foreground group-data-horizontal/tabs:after:inset-x-2 group-data-horizontal/tabs:after:bottom-0 group-data-horizontal/tabs:after:h-0.5 data-active:after:bg-[color:var(--brand-gold)] data-active:after:rounded-full"
            >
              {a.account_name || a.bank_name || "Bank account"}
            </TabsTrigger>
          ))}
        </TabsList>

        {accounts.map((a) => {
          const balance = Number(a.current_balance ?? 0);
          const asOf = formatDateLong(a.current_balance_as_of);
          return (
            <TabsContent key={a.id} value={a.id} className="mt-4">
              <div className="rounded-md border border-border bg-card p-5 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Balance
                    </p>
                    <p className="text-3xl font-bold tabular-nums text-foreground">
                      {formatCurrency(balance)}
                    </p>
                    {asOf && (
                      <p className="text-xs text-muted-foreground">as of {asOf}</p>
                    )}
                  </div>
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
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {importTarget && (
        <ImportCsvDialog
          ocId={ocId}
          account={importTarget}
          open={!!importTarget}
          onOpenChange={(o) => { if (!o) setImportTarget(null); }}
        />
      )}
    </div>
  );
}
