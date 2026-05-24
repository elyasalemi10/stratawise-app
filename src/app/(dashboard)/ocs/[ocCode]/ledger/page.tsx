import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Wallet } from "lucide-react";

// OC-level ledger page (first cut). For now we show only the entries
// that exist today , opening balances seeded during OC creation. Live
// movement (levy issuance, payment receipts, interest accrual,
// reconciliation matches) lands here in future iterations; the table
// shape and indexes are already in place to accept them.
//
// Per-lot drill-down stays on the existing lot detail → Ledger tab.

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    Math.abs(n),
  );

const FUND_LABEL: Record<string, string> = {
  administrative: "Admin",
  capital_works: "Capital works",
  maintenance_plan: "Maintenance",
};

const CATEGORY_LABEL: Record<string, string> = {
  levy: "Levy",
  special_levy: "Special levy",
  interest: "Interest",
  payment: "Payment",
  writeoff: "Write-off",
  adjustment_debit: "Opening balance",
  adjustment_credit: "Opening credit",
  refund: "Refund",
  void_offset: "Void offset",
};

export default async function OCLedgerPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  await requireOCAccess(resolved.id);

  const supabase = createServerClient();
  const { data: entries } = await supabase
    .from("lot_ledger_entries")
    .select(
      "id, lot_id, fund_type, entry_type, category, amount, entry_date, description, reference, status, created_at",
    )
    .eq("oc_id", resolved.id)
    .eq("status", "active")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  // One-shot lot label lookup so we can show "Lot 12 (Unit 3B)" inline.
  const lotIds = Array.from(
    new Set(((entries ?? []) as Array<{ lot_id: string }>).map((e) => e.lot_id)),
  );
  const { data: lotRows } = lotIds.length
    ? await supabase
        .from("lots")
        .select("id, lot_number, unit_number")
        .in("id", lotIds)
    : { data: [] as Array<{ id: string; lot_number: number; unit_number: string | null }> };
  const lotLabel: Record<string, { label: string; sort: number }> = {};
  for (const l of (lotRows ?? []) as Array<{
    id: string;
    lot_number: number;
    unit_number: string | null;
  }>) {
    lotLabel[l.id] = {
      label: `Lot ${l.lot_number}${l.unit_number ? ` · Unit ${l.unit_number}` : ""}`,
      sort: l.lot_number,
    };
  }

  const rows = (entries ?? []) as Array<{
    id: string;
    lot_id: string;
    fund_type: "administrative" | "capital_works" | "maintenance_plan";
    entry_type: "debit" | "credit";
    category: keyof typeof CATEGORY_LABEL;
    amount: number;
    entry_date: string;
    description: string | null;
    reference: string | null;
    status: string;
    created_at: string;
  }>;

  const totalDebit = rows
    .filter((r) => r.entry_type === "debit")
    .reduce((s, r) => s + Number(r.amount), 0);
  const totalCredit = rows
    .filter((r) => r.entry_type === "credit")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Entries
            </p>
            <p className="text-2xl font-bold tabular-nums">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total debits
            </p>
            <p className="text-2xl font-bold tabular-nums text-destructive">
              -{formatCurrency(totalDebit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total credits
            </p>
            <p className="text-2xl font-bold tabular-nums text-[hsl(160,100%,37%)]">
              +{formatCurrency(totalCredit)}
            </p>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No ledger entries yet"
          description="Opening balances added during OC creation appear here. Live levy issuance, payments, and adjustments will land here as they happen."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const lab = lotLabel[r.lot_id];
                const isDebit = r.entry_type === "debit";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      {new Date(r.entry_date).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lab ? (
                        <Link
                          href={`/ocs/${ocCode}/lots/${r.lot_id}?tab=ledger`}
                          className="text-foreground hover:underline"
                        >
                          {lab.label}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">,</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {FUND_LABEL[r.fund_type] ?? r.fund_type}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {CATEGORY_LABEL[r.category] ?? r.category}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-md">
                      {r.description ?? ""}
                    </TableCell>
                    <TableCell
                      className={`text-right text-sm font-medium tabular-nums ${
                        isDebit
                          ? "text-destructive"
                          : "text-[hsl(160,100%,37%)]"
                      }`}
                    >
                      {isDebit ? "-" : "+"}
                      {formatCurrency(Number(r.amount))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
