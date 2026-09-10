"use client";

import { useRouter } from "next/navigation";
import { urlSegment } from "@/lib/short-code-shared";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateLong } from "@/lib/utils";
import { ordinalRunLabel } from "@/lib/levy-autosend-helpers";
import type { UpcomingRun } from "./levy-schedule";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

// Anything that is not the admin fund is a custom fund, and lands in Other.
const KNOWN_FUNDS = new Set(["operating"]);

export interface LevyBatchRow {
  id: string;
  /** URL handle. Links use this; the UUID stays the key. */
  short_code?: string | null;
  financial_year: string;
  fund_type: string;
  period_label: string;
  due_date: string;
  total_amount: number;
  status: "draft" | "ledger_written" | "sent" | "partially_sent" | "cancelled";
  is_special: boolean;
}

function fundAmount(
  batch: { fund_type: string; total_amount: number },
  target: "operating" | "other",
): number | null {
  if (target === "other") {
    return KNOWN_FUNDS.has(batch.fund_type) ? null : batch.total_amount;
  }
  return batch.fund_type === target ? batch.total_amount : null;
}

export function LeviesTable({
  ocCode,
  batches,
  upcoming = [],
}: {
  ocCode: string;
  batches: LevyBatchRow[];
  /** Runs the schedule will make but has not made yet. Rendered above the
   *  real batches and deliberately not clickable: there is nothing to open. */
  upcoming?: UpcomingRun[];
}) {
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <Table variant="striped">
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Type</TableHead>
            <TableHead className="w-40">Financial Year</TableHead>
            <TableHead className="text-right">Operating</TableHead>
            <TableHead className="text-right">Other</TableHead>
            <TableHead className="w-36">Due date</TableHead>
            <TableHead className="w-36">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <QueuedRunRows upcoming={upcoming} />
          {batches.map((batch) => {
            const operating = fundAmount(batch, "operating");
            const other = fundAmount(batch, "other");
            return (
              <TableRow
                key={batch.id}
                className="cursor-pointer"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return;
                  router.push(`/ocs/${ocCode}/levies/${urlSegment(batch)}`);
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

/**
 * The runs that have not happened yet, as rows in the levy table.
 *
 * They were a separate dashed block above the table, which made them read as
 * a notice about the table rather than as part of it. A levy run is a levy
 * run whether it has happened or not, so it is a row: greyed, badged
 * Scheduled, and not clickable, because there is nothing to open yet.
 *
 * Which ones are still pending is decided server-side against the batches
 * that exist, so issuing a quarter by hand takes it off this list
 * immediately rather than at the next nightly run.
 */
export function QueuedRunRows({ upcoming }: { upcoming: UpcomingRun[] }) {
  if (upcoming.length === 0) return null;
  return (
    <>
      {upcoming.slice(0, 4).map((run, i) => (
        <TableRow key={run.monthKey} className="text-muted-foreground">
          <TableCell>Regular</TableCell>
          <TableCell>{ordinalRunLabel(i)} run</TableCell>
          <TableCell />
          <TableCell />
          <TableCell className="text-sm">{formatDateLong(run.plannedDate)}</TableCell>
          <TableCell>
            <Badge variant="neutral">Scheduled</Badge>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}
