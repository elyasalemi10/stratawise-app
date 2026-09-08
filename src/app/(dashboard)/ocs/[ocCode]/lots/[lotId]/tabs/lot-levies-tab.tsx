"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, FileText, ArrowDownToLine, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLotLevies, type LotLevyRow } from "@/lib/actions/lot-levies";
import { EmptyState } from "@/components/shared/empty-state";

// Levies tab , every levy notice ever issued to this lot, paid or unpaid.
// One row per notice. Paid/unpaid is read directly from the row's status +
// amount_paid (no balance arithmetic , see the per-levy assignment design
// note in the project context). Clicking a row opens the underlying PDF in
// a new tab when one's available.

interface Props {
  lotId: string;
}

const PAGE_SIZE = 20;

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A notice's LIFECYCLE, which is all a notice has.
//
// This used to render "Unpaid" for `issued`, "Partly paid", "Overdue" and
// "Paid": the paid/unpaid model, per document. Under balance accounting
// whether money is owed is a property of the LOT, not of any one notice, and
// it is already on the header of this page. A notice can only be a draft, a
// thing that was issued, or a thing that was cancelled or forgiven.
//
// It also mixed its own HSL values instead of the status tokens, which is
// how "paid" ended up with a different green from everywhere else.
function lifecycleBadge(row: LotLevyRow): React.ReactNode {
  switch (row.status) {
    case "draft":
      return <Badge variant="neutral">Draft</Badge>;
    case "cancelled":
      return <Badge variant="neutral">Cancelled</Badge>;
    case "written_off":
      return <Badge variant="neutral">Written off</Badge>;
    default:
      return <Badge variant="info">Issued</Badge>;
  }
}

export function LotLeviesTab({ lotId }: Props) {
  const [rows, setRows] = React.useState<LotLevyRow[] | null>(null);
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    listLotLevies(lotId).then((res) => {
      if (!cancelled) setRows(res);
    });
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  if (rows === null) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading levies…
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration="money"
        title="No levies issued"
        description="Levy notices issued against this lot will appear here."
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-4">
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[color:var(--brand-gold)]" />
          <h3 className="text-sm font-semibold text-foreground">All levies</h3>
          <span className="ml-1 text-xs text-muted-foreground">
            ({rows.length} {rows.length === 1 ? "notice" : "notices"})
          </span>
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {row.display_reference}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(row.period_start)} , {fmtDate(row.period_end)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {fmtDate(row.due_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(Number(row.amount))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(Number(row.amount_paid))}
                    </TableCell>
                    <TableCell>{lifecycleBadge(row)}</TableCell>
                    <TableCell>
                      {row.pdf_url ? (
                        <a
                          href={row.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Open levy PDF"
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <FileText className="mx-auto h-3.5 w-3.5 text-muted-foreground/30" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
            <span>
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
              {rows.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="rounded-md border border-border bg-card px-2 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 tabular-nums">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="rounded-md border border-border bg-card px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
