"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, FileText, ArrowDownToLine, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLotLevies, type LotLevyRow } from "@/lib/actions/lot-levies";

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

function paidBadge(row: LotLevyRow): React.ReactNode {
  if (row.status === "paid") {
    return (
      <Badge className="rounded-full bg-[hsl(160,60%,92%)] text-[hsl(160,100%,28%)] hover:bg-[hsl(160,60%,92%)]">
        Paid
      </Badge>
    );
  }
  if (row.status === "partially_paid") {
    return (
      <Badge className="rounded-full bg-[color:var(--brand-gold)]/15 text-[color:var(--brand-gold)] hover:bg-[color:var(--brand-gold)]/15">
        Partly paid
      </Badge>
    );
  }
  if (row.status === "overdue") {
    return (
      <Badge className="rounded-full bg-destructive/10 text-destructive hover:bg-destructive/10">
        Overdue
      </Badge>
    );
  }
  if (row.status === "issued") {
    return (
      <Badge className="rounded-full bg-cool-muted text-cool-muted-foreground hover:bg-cool-muted">
        Unpaid
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" className="rounded-full">
      {row.status}
    </Badge>
  );
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
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-base font-semibold text-foreground">
            No levies issued
          </p>
          <p className="text-sm text-muted-foreground">
            Levy notices issued against this lot will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  return (
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
                const outstanding = Math.max(
                  0,
                  Number(row.amount) - Number(row.amount_paid),
                );
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">
                      {row.reference_number}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtDate(row.period_start)} – {fmtDate(row.period_end)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {fmtDate(row.due_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(Number(row.amount))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtCurrency(Number(row.amount_paid))}
                      {outstanding > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({fmtCurrency(outstanding)} left)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{paidBadge(row)}</TableCell>
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
  );
}
