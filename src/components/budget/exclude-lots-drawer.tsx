"use client";

import { Users } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { LotForFund } from "@/lib/actions/funds";

export interface ExcludeLotsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All lots in the OC. */
  lots: LotForFund[];
  /** Currently-excluded lot ids for this line item. */
  value: string[];
  onChange: (excludedLotIds: string[]) => void;
  /** Line-item name shown in the drawer title (e.g. the account name). */
  itemLabel: string;
}

function lotLabel(lot: LotForFund): string {
  return lot.unit_number ? `Lot ${lot.lot_number}, Unit ${lot.unit_number}` : `Lot ${lot.lot_number}`;
}

// Per-line-item lot exclusion picker. Ticking a lot EXCLUDES it from paying
// for this budget line; the remaining lots cover the full cost (renormalised
// by their liability). Drawer closes via the overlay; the footer only holds
// the forward action.
export function ExcludeLotsDrawer({
  open, onOpenChange, lots, value, onChange, itemLabel,
}: ExcludeLotsDrawerProps) {
  const excluded = new Set(value);
  const payingCount = lots.length - excluded.size;

  function toggle(lotId: string, on: boolean) {
    const next = new Set(excluded);
    if (on) next.add(lotId);
    else next.delete(lotId);
    onChange(Array.from(next));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Exclude lots from {itemLabel || "this line"}</SheetTitle>
          <SheetDescription>
            Ticked lots won&apos;t pay for this line. The remaining lots cover the
            full cost, split by their liability.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-1 overflow-y-auto px-4">
          {lots.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              This OC has no lots yet.
            </p>
          ) : (
            lots.map((lot) => (
              <div
                key={lot.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
              >
                <Checkbox
                  checked={excluded.has(lot.id)}
                  onCheckedChange={(v) => toggle(lot.id, v === true)}
                  className="bg-card"
                  aria-label={`Exclude ${lotLabel(lot)}`}
                />
                <span className="text-sm text-foreground">{lotLabel(lot)}</span>
              </div>
            ))
          )}
        </div>

        <SheetFooter>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {payingCount} of {lots.length} lots pay this line
            </span>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
