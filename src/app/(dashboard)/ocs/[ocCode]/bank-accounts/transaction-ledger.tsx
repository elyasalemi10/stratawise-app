"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

// One continuous statement, not a month at a time.
//
// The month stepper this replaces made the manager click to reach data that
// was already on the client, and it broke the one thing a statement is for:
// a payment made on the 31st and the invoice it settles on the 1st are one
// event, and paging between them puts a click in the middle of it. Months
// are still the unit people think in, so they stay, as sticky breakers
// carrying that month's totals rather than as a wall between two screens.
//
// It is not a <Table>. The primitive wraps itself in an overflow-x-auto
// container, and a container with overflow on one axis is a scrollport on
// both, so a sticky month header inside one sticks to a box exactly as tall
// as its own contents, which is to say it does not stick at all.

export interface LedgerTxn {
  id: string;
  date: string | null;
  description: string;
  amount: number | null;
  balance: number | null;
  matchStatus: string;
  voided: boolean;
}

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});
const monthLabelFmt = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  year: "numeric",
});
const dayFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
});

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return dayFmt.format(new Date(`${iso}T00:00:00`));
}

function labelForMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthLabelFmt.format(new Date(y, m - 1, 1));
}

/**
 * A row that needs someone to do something.
 *
 * Deliberately narrower than "match_status is unmatched". Auto-matching
 * attributes incoming receipts to levy notices; it has nothing to say about
 * money going out, so every expense the OC has ever paid is unmatched and
 * always will be. Flagging those would put an amber bar on most of the page
 * and the flag would stop meaning anything. Money ARRIVING with nobody
 * attached to it is the actionable case: someone paid, and until it is
 * matched their lot still reads as owing it.
 */
function needsAttention(t: LedgerTxn): boolean {
  return !t.voided && t.matchStatus === "unmatched" && (t.amount ?? 0) > 0;
}

/**
 * Fill the balance column where the file did not supply one.
 *
 * Most statements carry a running balance and we keep whatever the bank
 * said, because it is the bank's own record and ours is an inference. Where
 * a row has none, the neighbours plus the amounts give it: forwards adds the
 * row's own amount, backwards subtracts the next row's. Two passes cover
 * every gap regardless of where the known values sit.
 *
 * With no known balance anywhere the column stays empty. A running total
 * from an invented zero is a number the bank never said, printed in the
 * column where the bank's number goes.
 */
function fillBalances(ascending: LedgerTxn[]): Map<string, number> {
  const out: Array<number | null> = ascending.map((t) => t.balance);
  for (let i = 1; i < out.length; i++) {
    if (out[i] === null && out[i - 1] !== null) {
      out[i] = out[i - 1]! + (ascending[i].amount ?? 0);
    }
  }
  for (let i = out.length - 2; i >= 0; i--) {
    if (out[i] === null && out[i + 1] !== null) {
      out[i] = out[i + 1]! - (ascending[i + 1].amount ?? 0);
    }
  }
  const map = new Map<string, number>();
  ascending.forEach((t, i) => {
    if (out[i] !== null) map.set(t.id, out[i]!);
  });
  return map;
}

type Item =
  | { kind: "month"; key: string; label: string; inflow: number; outflow: number }
  | { kind: "row"; txn: LedgerTxn; balance: number | null };

/** How many rows are on screen before scrolling asks for more. */
const PAGE = 60;

export function TransactionLedger({
  transactions,
}: {
  /** Newest first, as the server returns them. */
  transactions: LedgerTxn[];
}) {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  const flaggedCount = useMemo(
    () => transactions.filter(needsAttention).length,
    [transactions],
  );

  const balances = useMemo(() => {
    // Chronological is the reverse of what the server sent, which keeps
    // whatever order it used inside a single day rather than inventing one.
    const dated = transactions.filter((t) => t.date);
    return fillBalances([...dated].reverse());
  }, [transactions]);

  const items = useMemo<Item[]>(() => {
    const rows = flaggedOnly ? transactions.filter(needsAttention) : transactions;
    const groups: Array<{ key: string; rows: LedgerTxn[] }> = [];
    for (const t of rows) {
      const key = t.date ? t.date.slice(0, 7) : "undated";
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(t);
      else groups.push({ key, rows: [t] });
    }
    const flat: Item[] = [];
    for (const g of groups) {
      let inflow = 0;
      let outflow = 0;
      for (const t of g.rows) {
        if (t.voided) continue;
        const a = t.amount ?? 0;
        if (a > 0) inflow += a;
        else outflow -= a;
      }
      flat.push({
        kind: "month",
        key: g.key,
        label: g.key === "undated" ? "No date" : labelForMonthKey(g.key),
        inflow,
        outflow,
      });
      for (const t of g.rows) {
        flat.push({ kind: "row", txn: t, balance: balances.get(t.id) ?? null });
      }
    }
    return flat;
  }, [transactions, flaggedOnly, balances]);

  const shown = items.slice(0, visible);
  const hasMore = items.length > visible;

  const sentinel = useRef<HTMLDivElement | null>(null);
  const grow = useCallback(() => setVisible((v) => v + PAGE), []);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) grow();
      },
      // Start the next slice while the last one is still a screen away, so
      // the list never visibly stops.
      { rootMargin: "600px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, grow]);

  if (transactions.length === 0) {
    return (
      <EmptyState
        illustration="money"
        title="No transactions yet"
        description="Import a CSV statement to populate this account."
        card={false}
      />
    );
  }

  return (
    <div className="space-y-3">
      {flaggedCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setFlaggedOnly((v) => !v);
              // Back to one screen. Otherwise filtering down to eight rows
              // and back leaves the full list already fully expanded.
              setVisible(PAGE);
            }}
            aria-pressed={flaggedOnly}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors cursor-pointer",
              flaggedOnly
                ? "border-[color:var(--warning)] bg-warning-muted text-warning-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--warning)]" />
            {flaggedCount} unmatched receipt{flaggedCount === 1 ? "" : "s"}
          </button>
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        {shown.map((item) =>
          item.kind === "month" ? (
            <div
              key={`m-${item.key}`}
              className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-border bg-muted px-4 py-2 sm:grid-cols-[minmax(0,1fr)_16rem]"
            >
              <span className="text-sm font-semibold text-foreground">
                {item.label}
              </span>
              <span className="flex justify-end gap-4 text-xs tabular-nums sm:gap-6">
                <span className="text-muted-foreground">
                  In{" "}
                  <span className="font-medium text-foreground">
                    {currency.format(item.inflow)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Out{" "}
                  <span className="font-medium text-foreground">
                    {currency.format(item.outflow)}
                  </span>
                </span>
              </span>
            </div>
          ) : (
            <LedgerRow key={item.txn.id} txn={item.txn} balance={item.balance} />
          ),
        )}
        {hasMore && <div ref={sentinel} className="h-10" />}
      </div>
    </div>
  );
}

function LedgerRow({
  txn,
  balance,
}: {
  txn: LedgerTxn;
  balance: number | null;
}) {
  const flagged = needsAttention(txn);
  const inactive = txn.voided || txn.matchStatus === "excluded";
  const amount = txn.amount;

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 border-b border-l-2 border-border px-4 py-2.5 last:border-b-0",
        "sm:grid-cols-[4.5rem_minmax(0,1fr)_8rem_8rem]",
        // Every row carries the left rule so a flagged one colours in place
        // instead of shunting its text two pixels sideways.
        flagged
          ? "border-l-[color:var(--warning)] bg-warning-muted"
          : "border-l-transparent",
        inactive && "opacity-55",
      )}
    >
      <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
        {formatDay(txn.date)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-foreground">
          {txn.description}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground sm:hidden">
          {formatDay(txn.date)}
        </span>
      </span>
      <span
        className={cn(
          "text-right text-sm tabular-nums",
          inactive && "line-through",
          amount !== null && amount < 0 ? "text-destructive" : "text-foreground",
        )}
      >
        {amount !== null ? currency.format(amount) : ""}
      </span>
      <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">
        {balance !== null ? currency.format(balance) : ""}
      </span>
    </div>
  );
}
