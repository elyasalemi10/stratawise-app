"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { assignTransactionEntity } from "./actions";
import type { EntityKind, EntityOption } from "./data";

// One statement, one table, from the newest line to the oldest.
//
// No month sections and no balance column. A statement is read by running
// down it, and every heading in the middle is a place the eye has to stop
// and re-acquire the columns. What a manager is actually doing here is
// answering "what was that one for", which is a fourth column, not a fifth
// heading.
//
// Entity is that column. It is the one thing on the page that is ours rather
// than the bank's: the bank knows the date, the description and the amount,
// and nobody but the manager knows that the $1,840 on the 14th was the
// plumber. Until it is said out loud it lives in one person's memory.
//
// A real <table>, not a grid of divs. Four fixed columns with no sticky
// anything is precisely what the primitive is for, and hand-rolling the
// alignment meant every row carried its own copy of the column template and
// any one of them could disagree with the header.

export interface LedgerTxn {
  id: string;
  date: string | null;
  description: string;
  amount: number | null;
  balance: number | null;
  matchStatus: string;
  voided: boolean;
  entity: { kind: EntityKind; id: string } | null;
}

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});
const dayFmt = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return dayFmt.format(new Date(`${iso}T00:00:00`));
}

const KIND_ORDER: EntityKind[] = ["lot", "contractor", "maintenance_request"];

/** How many rows are on screen before scrolling asks for more. */
const PAGE = 80;

export function TransactionLedger({
  ocId,
  transactions,
  entityOptions,
  onAssign,
}: {
  ocId: string;
  /** Newest first, as the server returns them. */
  transactions: LedgerTxn[];
  entityOptions: EntityOption[];
  /** Writes the assignment into the page's cached data, so the pill changes
   *  on click rather than after the next poll. */
  onAssign: (txnId: string, entity: { kind: EntityKind; id: string } | null) => void;
}) {
  const [visible, setVisible] = useState(PAGE);

  const optionByKey = useMemo(
    () => new Map(entityOptions.map((o) => [`${o.kind}:${o.id}`, o])),
    [entityOptions],
  );

  const shown = transactions.slice(0, visible);
  const hasMore = transactions.length > visible;

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
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {/* Striped AND ruled. The stripe is what lets the eye run along one
          row across four columns; the rule is what stops two same-shade
          neighbours reading as one. The Lots register does both. */}
      <Table variant="striped">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[7rem]">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[14rem] text-center">Entity</TableHead>
            <TableHead className="w-[9rem] text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_tr]:border-b [&_tr]:border-border">
          {shown.map((txn) => (
            <LedgerRow
              key={txn.id}
              ocId={ocId}
              txn={txn}
              entityOptions={entityOptions}
              current={
                txn.entity ? optionByKey.get(`${txn.entity.kind}:${txn.entity.id}`) ?? null : null
              }
              onAssign={onAssign}
            />
          ))}
        </TableBody>
      </Table>
      {hasMore && <div ref={sentinel} className="h-10" />}
    </div>
  );
}

function LedgerRow({
  ocId,
  txn,
  entityOptions,
  current,
  onAssign,
}: {
  ocId: string;
  txn: LedgerTxn;
  entityOptions: EntityOption[];
  current: EntityOption | null;
  onAssign: (txnId: string, entity: { kind: EntityKind; id: string } | null) => void;
}) {
  const amount = txn.amount;
  const inactive = txn.voided || txn.matchStatus === "excluded";

  return (
    <TableRow className="h-11">
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {formatDay(txn.date)}
      </TableCell>
      <TableCell className="max-w-0 truncate text-sm text-foreground">
        {txn.description}
      </TableCell>
      {/* The pill has its own hover, so the row's steps aside for it. */}
      <TableCell className="text-center" data-row-hover-off>
        <EntityPill
          ocId={ocId}
          txnId={txn.id}
          current={current}
          assigned={txn.entity}
          options={entityOptions}
          onAssign={onAssign}
        />
      </TableCell>
      <TableCell
        className={cn(
          // The only colour on the row. Everything else is one shade, so a
          // column of green and red is the whole scan: money in, money out,
          // and nothing else competing for it.
          "text-right text-sm font-bold tabular-nums",
          inactive && "line-through opacity-55",
          // --success, not --success-foreground: the foreground token is a
          // 20%-lightness green meant for text on a tinted badge, and at
          // this weight on white it read as black.
          amount !== null && amount < 0
            ? "text-destructive"
            : "text-[color:var(--success)]",
        )}
      >
        {amount !== null ? currency.format(amount) : ""}
      </TableCell>
    </TableRow>
  );
}

function EntityPill({
  ocId,
  txnId,
  current,
  assigned,
  options,
  onAssign,
}: {
  ocId: string;
  txnId: string;
  current: EntityOption | null;
  assigned: { kind: EntityKind; id: string } | null;
  options: EntityOption[];
  onAssign: (txnId: string, entity: { kind: EntityKind; id: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // One flat list, ordered lots then contractors then jobs. It was grouped
  // under headings, and with one heading showing (most OCs have no
  // contractors yet) the word "Lots" was a row of chrome above a list of
  // lots. Each row already says what it is on its second line.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.detail ?? "").toLowerCase().includes(q),
        )
      : options;
    return [...filtered].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
    );
  }, [options, query]);

  async function pick(next: { kind: EntityKind; id: string } | null) {
    const previous = assigned;
    const label = next
      ? options.find((o) => o.kind === next.kind && o.id === next.id)?.label
      : null;
    // Optimistic. The pill is the whole point of the click and a round trip
    // before it changes reads as the click not having landed.
    onAssign(txnId, next);
    setOpen(false);
    setSaving(true);
    const res = await assignTransactionEntity(ocId, txnId, next);
    setSaving(false);
    if (res.error) {
      onAssign(txnId, previous);
      toast.error(res.error);
      return;
    }
    // Say so, because assigning an incoming payment to a lot does not just
    // label the line: it records the payment, and the lot's balance moves.
    // A silent click that quietly changes what someone owes is the wrong
    // kind of quiet.
    if (!next) {
      toast.success("Assignment cleared");
    } else if (res.paymentRecorded) {
      toast.success(`Payment recorded against ${label ?? "the lot"}`);
    } else {
      toast.success(`Assigned to ${label ?? "it"}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* A pill either way. Unassigned used to be bare text with a plus,
          which read as a caption rather than as the control it is, so the
          one column on the page that wants clicking was the one that did not
          look clickable. */}
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 max-w-full cursor-pointer items-center gap-1 rounded-full px-2.5 text-xs font-medium",
          "ring-1 ring-inset transition-colors",
          current
            ? "bg-secondary text-foreground ring-border hover:bg-secondary-hover"
            : "bg-card text-muted-foreground ring-border hover:bg-muted hover:text-foreground",
          saving && "opacity-60",
        )}
      >
        {current ? (
          <span className="truncate">{current.short}</span>
        ) : (
          <>
            <Plus className="h-3 w-3 shrink-0" />
            Assign
          </>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" showBackdrop={false}>
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a lot, contractor or job"
            className="h-8 pl-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {matches.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Nothing matches.
            </p>
          ) : (
            matches.map((o) => {
              const on = assigned?.kind === o.kind && assigned.id === o.id;
              return (
                // Clicking the one already chosen clears it, which is why
                // there is no Clear button underneath: the tick is the
                // toggle, and a second control for the same act just means
                // two ways to get it wrong.
                <button
                  key={`${o.kind}:${o.id}`}
                  type="button"
                  onClick={() => pick(on ? null : { kind: o.kind, id: o.id })}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                >
                  {/* Name on top, at the size a name deserves; what it means
                      underneath. A manager reconciling a receipt is looking
                      for the person, and "Lot 3 · Unit 2" first made them
                      read every row twice. */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {o.label}
                    </span>
                    {o.detail && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {o.detail}
                      </span>
                    )}
                  </span>
                  {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={3} />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
