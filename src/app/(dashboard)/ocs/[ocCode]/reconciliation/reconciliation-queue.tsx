"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MatchDrawer } from "./match-drawer";

interface UnmatchedTxn {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  matched_total: number;
  deft_reference_number: string | null;
}

interface BankAccount {
  id: string;
  account_name: string | null;
  bank_name: string | null;
}

interface Lot {
  id: string;
  lot_number: number | null;
  unit_number: string | null;
  primary_owner_name: string | null;
}

interface OpenLevy {
  id: string;
  lot_id: string;
  reference_number: string;
  fund_type: "operating" | "maintenance_plan";
  amount: number;
  amount_paid: number;
  due_date: string;
  status: string;
}

const currencyFmt = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReconciliationQueue({
  ocId,
  transactions,
  accounts,
  lots,
  levies,
}: {
  ocId: string;
  transactions: UnmatchedTxn[];
  accounts: BankAccount[];
  lots: Lot[];
  levies: OpenLevy[];
}) {
  const router = useRouter();
  const [active, setActive] = useState<UnmatchedTxn | null>(null);

  const accountById = useMemo(() => {
    const m = new Map<string, BankAccount>();
    for (const a of accounts) m.set(a.id, a);
    return m;
  }, [accounts]);

  const accountLabel = (id: string) => {
    const a = accountById.get(id);
    if (!a) return "";
    return a.account_name || a.bank_name || "Bank account";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {transactions.length} unmatched{" "}
          {transactions.length === 1 ? "transaction" : "transactions"}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead className="w-[170px]">Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[130px]">Reference</TableHead>
              <TableHead className="w-[130px] text-right">Amount</TableHead>
              <TableHead className="w-[120px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-foreground text-xs">
                  {formatDate(t.transaction_date)}
                </TableCell>
                <TableCell className="text-foreground text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                    {accountLabel(t.bank_account_id)}
                  </span>
                </TableCell>
                <TableCell className="text-foreground text-xs">
                  {t.description ?? ""}
                </TableCell>
                <TableCell className="text-foreground text-xs">
                  {t.deft_reference_number ?? ""}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs text-foreground">
                  {currencyFmt.format(t.amount)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setActive(t)}
                  >
                    Match
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {active && (
        <MatchDrawer
          ocId={ocId}
          transaction={active}
          accountLabel={accountLabel(active.bank_account_id)}
          lots={lots}
          levies={levies}
          open={!!active}
          onOpenChange={(o) => {
            if (!o) setActive(null);
          }}
          onMatched={() => {
            setActive(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
