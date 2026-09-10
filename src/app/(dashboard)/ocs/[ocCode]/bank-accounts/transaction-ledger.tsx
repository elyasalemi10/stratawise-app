"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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

const KIND_LABEL: Record<EntityKind, string> = {
  lot: "Lots",
  contractor: "Contractors",
  maintenance_request: "Maintenance",
};

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
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_10rem_7.5rem] items-center gap-3 border-b border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
        <span>Date</span>
        <span>Description</span>
        <span>Entity</span>
        <span className="text-right">Amount</span>
      </div>
      {shown.map((txn) => (
        <LedgerRow
          key={txn.id}
          ocId={ocId}
          txn={txn}
          entityOptions={entityOptions}
          current={txn.entity ? optionByKey.get(`${txn.entity.kind}:${txn.entity.id}`) ?? null : null}
          onAssign={onAssign}
        />
      ))}
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
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_10rem_7.5rem] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
      <span className="text-xs tabular-nums text-muted-foreground">
        {formatDay(txn.date)}
      </span>
      <span className="min-w-0 truncate text-sm text-foreground">{txn.description}</span>
      <EntityPill
        ocId={ocId}
        txnId={txn.id}
        current={current}
        assigned={txn.entity}
        options={entityOptions}
        onAssign={onAssign}
      />
      <span
        className={cn(
          // The only colour on the row. Everything else is one shade, so a
          // column of green and red is the whole scan: money in, money out,
          // and nothing else competing for it.
          "text-right text-sm font-bold tabular-nums",
          inactive && "line-through opacity-55",
          amount !== null && amount < 0
            ? "text-destructive"
            : "text-[color:var(--success-foreground)]",
        )}
      >
        {amount !== null ? currency.format(amount) : ""}
      </span>
    </div>
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

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.detail ?? "").toLowerCase().includes(q),
        )
      : options;
    return KIND_ORDER.map((kind) => ({
      kind,
      rows: matches.filter((o) => o.kind === kind),
    })).filter((g) => g.rows.length > 0);
  }, [options, query]);

  async function pick(next: { kind: EntityKind; id: string } | null) {
    const previous = assigned;
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
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 max-w-full cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors",
          current
            ? "bg-secondary text-foreground ring-1 ring-inset ring-border hover:bg-secondary-hover"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          saving && "opacity-60",
        )}
      >
        {current ? (
          <span className="truncate">{current.label}</span>
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
          {groups.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Nothing matches.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.kind}>
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  {KIND_LABEL[g.kind]}
                </p>
                {g.rows.map((o) => {
                  const on = assigned?.kind === o.kind && assigned.id === o.id;
                  return (
                    <button
                      key={`${o.kind}:${o.id}`}
                      type="button"
                      onClick={() => pick(on ? null : { kind: o.kind, id: o.id })}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
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
                })}
              </div>
            ))
          )}
        </div>
        {current && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => pick(null)}
              className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/5"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
