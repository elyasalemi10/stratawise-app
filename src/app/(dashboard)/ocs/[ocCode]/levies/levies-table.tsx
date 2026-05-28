"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateLong } from "@/lib/utils";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const KNOWN_FUNDS = new Set(["operating", "maintenance_plan"]);

export interface LevyBatchRow {
  id: string;
  financial_year: string;
  fund_type: "operating" | "maintenance_plan";
  period_label: string;
  due_date: string;
  total_amount: number;
  status: "draft" | "ledger_written" | "sent" | "partially_sent" | "cancelled";
  is_special: boolean;
}

function fundAmount(
  batch: { fund_type: string; total_amount: number },
  target: "operating" | "maintenance_plan" | "other",
): number | null {
  if (target === "other") {
    return KNOWN_FUNDS.has(batch.fund_type) ? null : batch.total_amount;
  }
  return batch.fund_type === target ? batch.total_amount : null;
}

export function LeviesTable({ ocCode, batches }: { ocCode: string; batches: LevyBatchRow[] }) {
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <Table variant="striped">
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-40">Financial Year</TableHead>
            <TableHead className="text-right">Operating</TableHead>
            <TableHead className="text-right">Maintenance</TableHead>
            <TableHead className="text-right">Other</TableHead>
            <TableHead className="w-36">Due date</TableHead>
            <TableHead className="w-36">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => {
            const operating = fundAmount(batch, "operating");
            const maintenance = fundAmount(batch, "maintenance_plan");
            const other = fundAmount(batch, "other");
            return (
              <TableRow
                key={batch.id}
                className="cursor-pointer"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  router.push(`/ocs/${ocCode}/levies/${batch.id}`);
                }}
              >
                <TableCell className="text-foreground">
                  {batch.is_special ? "Special" : "Regular"}
                </TableCell>
                <TableCell className="text-foreground">
                  {/* Special levies live outside the budget calendar
                      so the synthetic FY we stamp on the row is
                      meaningless to a manager scanning the list. */}
                  {batch.is_special ? "Special" : `${batch.period_label} ${batch.financial_year}`}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {operating !== null ? formatCurrency(operating) : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {maintenance !== null ? formatCurrency(maintenance) : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {other !== null ? formatCurrency(other) : ""}
                </TableCell>
                <TableCell className="text-foreground text-sm">
                  {formatDateLong(batch.due_date)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      batch.status === "sent" ? "success"
                      : batch.status === "partially_sent" ? "warning"
                      : batch.status === "cancelled" ? "destructive"
                      : "neutral"
                    }
                  >
                    {batch.status === "sent" ? "Sent"
                      : batch.status === "partially_sent" ? "Partially sent"
                      : batch.status === "cancelled" ? "Cancelled"
                      : "Draft"}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
