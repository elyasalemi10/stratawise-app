"use client";

import { useState } from "react";
import { Landmark, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportCsvDialog } from "./import-csv-dialog";

const FUND_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

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
  fund_type: string;
  bank_name: string | null;
  current_balance: number | string | null;
  current_balance_as_of: string | null;
}

export function BankAccountsList({
  ocId,
  accounts,
}: {
  ocId: string;
  accounts: BankAccountRow[];
}) {
  const [importTarget, setImportTarget] = useState<BankAccountRow | null>(null);

  return (
    <>
      <div className="overflow-hidden rounded-md border border-border bg-card divide-y divide-border">
        {accounts.map((a) => {
          const balance = Number(a.current_balance ?? 0);
          const asOf = formatDateLong(a.current_balance_as_of);
          return (
            <div
              key={a.id}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                  <Landmark className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {a.account_name || a.bank_name || "Bank account"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {FUND_LABEL[a.fund_type] ?? a.fund_type}
                    {a.bsb && a.account_number ? (
                      <> &middot; {a.bsb} {a.account_number}</>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-foreground">
                    {formatCurrency(balance)}
                  </div>
                  {asOf && (
                    <div className="text-[11px] text-muted-foreground">as of {asOf}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setImportTarget(a)}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Import CSV
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {importTarget && (
        <ImportCsvDialog
          ocId={ocId}
          account={importTarget}
          open={!!importTarget}
          onOpenChange={(o) => { if (!o) setImportTarget(null); }}
        />
      )}
    </>
  );
}
