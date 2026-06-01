"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { reconcileBankTransaction } from "./actions";

interface Txn {
  id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string | null;
  amount: number;
  matched_total: number;
  deft_reference_number: string | null;
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

const FUND_LABEL: Record<"operating" | "maintenance_plan", string> = {
  operating: "Operating fund",
  maintenance_plan: "Maintenance plan fund",
};

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const currencyFmt = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

export function MatchDrawer({
  ocId,
  transaction,
  accountLabel,
  lots,
  levies,
  open,
  onOpenChange,
  onMatched,
}: {
  ocId: string;
  transaction: Txn;
  accountLabel: string;
  lots: Lot[];
  levies: OpenLevy[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatched: () => void;
}) {
  const remaining = transaction.amount - transaction.matched_total;

  const [lotId, setLotId] = useState<string>("");
  const [fundType, setFundType] = useState<"operating" | "maintenance_plan">(
    "operating",
  );
  const [levyId, setLevyId] = useState<string>("none");
  const [amount, setAmount] = useState<string>(remaining.toFixed(2));
  const [notes, setNotes] = useState<string>("");
  const [invalid, setInvalid] = useState<{ lot?: boolean; amount?: boolean }>({});
  const [pending, startTransition] = useTransition();

  // Reset whenever the drawer opens for a new transaction.
  useEffect(() => {
    if (!open) return;
    setLotId("");
    setFundType("operating");
    setLevyId("none");
    setAmount(remaining.toFixed(2));
    setNotes("");
    setInvalid({});
  }, [open, remaining]);

  const leviesForLot = useMemo(
    () => (lotId ? levies.filter((l) => l.lot_id === lotId) : []),
    [levies, lotId],
  );

  // Auto-pick fund_type from the selected levy notice.
  useEffect(() => {
    if (levyId === "none") return;
    const levy = levies.find((l) => l.id === levyId);
    if (levy) setFundType(levy.fund_type);
  }, [levyId, levies]);

  // Picking a new lot clears any levy selection that no longer fits.
  useEffect(() => {
    if (levyId === "none") return;
    const levy = levies.find((l) => l.id === levyId);
    if (!levy || levy.lot_id !== lotId) setLevyId("none");
  }, [lotId, levyId, levies]);

  function submit() {
    const issues: typeof invalid = {};
    if (!lotId) issues.lot = true;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > remaining + 0.001) {
      issues.amount = true;
    }
    setInvalid(issues);
    if (Object.keys(issues).length > 0) {
      toast.error(
        issues.amount
          ? `Amount must be between $0.01 and ${currencyFmt.format(remaining)}.`
          : "Pick a lot before saving.",
      );
      return;
    }

    startTransition(async () => {
      const res = await reconcileBankTransaction({
        ocId,
        bankTransactionId: transaction.id,
        lotId,
        fundType,
        amount: parsed,
        levyNoticeId: levyId === "none" ? null : levyId,
        notes: notes.trim() || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Match saved");
      onMatched();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <SheetContent side="right" className="w-[460px] sm:max-w-none flex flex-col">
        <SheetHeader>
          <SheetTitle>Match transaction</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 space-y-5">
          <div className="rounded-md border border-border bg-cool-muted p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {dateFmt.format(new Date(`${transaction.transaction_date}T00:00:00`))}
              </span>
              <span className="font-medium text-foreground tabular-nums">
                {currencyFmt.format(transaction.amount)}
              </span>
            </div>
            <p className="text-sm text-foreground">{accountLabel}</p>
            {transaction.description && (
              <p className="text-xs text-muted-foreground">
                {transaction.description}
              </p>
            )}
            {transaction.deft_reference_number && (
              <p className="text-xs text-muted-foreground">
                Reference: {transaction.deft_reference_number}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-lot">
              Lot <span className="text-destructive">*</span>
            </Label>
            <Select value={lotId} onValueChange={(v) => { setLotId(v ?? ""); setInvalid((p) => ({ ...p, lot: false })); }}>
              <SelectTrigger id="match-lot" aria-invalid={invalid.lot || undefined}>
                <SelectValue placeholder="Pick a lot" />
              </SelectTrigger>
              <SelectContent>
                {lots.map((l) => {
                  const lotLabel = l.unit_number
                    ? `Unit ${l.unit_number}`
                    : `Lot ${l.lot_number ?? "—"}`;
                  return (
                    <SelectItem key={l.id} value={l.id}>
                      {lotLabel}
                      {l.primary_owner_name ? ` · ${l.primary_owner_name}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-levy">Apply to levy notice</Label>
            <Select
              value={levyId}
              onValueChange={(v) => setLevyId(v ?? "none")}
              disabled={!lotId}
            >
              <SelectTrigger id="match-levy">
                <SelectValue placeholder="None (general payment)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (general payment)</SelectItem>
                {leviesForLot.map((l) => {
                  const outstanding = l.amount - l.amount_paid;
                  return (
                    <SelectItem key={l.id} value={l.id}>
                      {l.reference_number} · {FUND_LABEL[l.fund_type]} ·{" "}
                      {currencyFmt.format(outstanding)} outstanding
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-fund">
              Fund <span className="text-destructive">*</span>
            </Label>
            <Select
              value={fundType}
              onValueChange={(v) => v && setFundType(v as "operating" | "maintenance_plan")}
              disabled={levyId !== "none"}
            >
              <SelectTrigger id="match-fund">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operating">Operating fund</SelectItem>
                <SelectItem value="maintenance_plan">Maintenance plan fund</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-amount">
              Amount <span className="text-destructive">*</span>
            </Label>
            <NumberInput
              id="match-amount"
              value={amount}
              onChange={(v) => { setAmount(v); setInvalid((p) => ({ ...p, amount: false })); }}
              invalid={invalid.amount || undefined}
              thousandsSeparator
              prefix="$"
              placeholder="Amount to allocate"
              allowDecimal
            />
            <p className="text-xs text-muted-foreground">
              Remaining on this transaction: {currencyFmt.format(remaining)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-notes">Notes</Label>
            <Input
              id="match-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </div>

        <SheetFooter>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save match
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
