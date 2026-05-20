"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/shared/date-picker";
import { Button } from "@/components/ui/button";
import { createFundTransfer } from "@/lib/actions/fund-transfers";
import type { BankAccountSummary } from "@/lib/validations/bank-transactions";

const FUND_LABEL: Record<BankAccountSummary["fund_type"], string> = {
  administrative: "Administrative fund",
  capital_works: "Capital works fund",
  maintenance_plan: "Maintenance plan fund",
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export function TransferFundsDialog({
  open,
  onClose,
  ocId,
  bankAccounts,
  onTransferred,
}: {
  open: boolean;
  onClose: () => void;
  ocId: string;
  bankAccounts: BankAccountSummary[];
  onTransferred: () => void;
}) {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [transferDate, setTransferDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = useState<string>("");
  const [pending, setPending] = useState(false);

  const [fromInvalid, setFromInvalid] = useState(false);
  const [toInvalid, setToInvalid] = useState(false);
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [dateInvalid, setDateInvalid] = useState(false);

  const fromAccount = bankAccounts.find((a) => a.id === fromId) ?? null;

  // Destination options exclude the chosen source so the two funds always differ.
  const toOptions = useMemo(
    () => bankAccounts.filter((a) => a.id !== fromId),
    [bankAccounts, fromId],
  );

  function reset() {
    setFromId("");
    setToId("");
    setAmount("");
    setTransferDate(new Date().toISOString().slice(0, 10));
    setReason("");
    setFromInvalid(false);
    setToInvalid(false);
    setAmountInvalid(false);
    setDateInvalid(false);
  }

  async function onSubmit() {
    const problems: string[] = [];

    if (!fromId) { problems.push("Choose the fund to transfer from."); setFromInvalid(true); }
    else setFromInvalid(false);

    if (!toId) { problems.push("Choose the fund to transfer to."); setToInvalid(true); }
    else setToInvalid(false);

    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      problems.push("Enter an amount greater than zero.");
      setAmountInvalid(true);
    } else if (fromAccount && amt > fromAccount.current_balance) {
      problems.push(
        `The ${FUND_LABEL[fromAccount.fund_type].toLowerCase()} only holds ${formatCurrency(fromAccount.current_balance)}.`,
      );
      setAmountInvalid(true);
    } else {
      setAmountInvalid(false);
    }

    if (!transferDate) { problems.push("Pick a transfer date."); setDateInvalid(true); }
    else setDateInvalid(false);

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const result = await createFundTransfer({
      oc_id: ocId,
      from_bank_account_id: fromId,
      to_bank_account_id: toId,
      amount: amt,
      transfer_date: transferDate,
      reason: reason.trim() || null,
    });
    if (result.error) {
      setPending(false);
      toast.error(result.error);
      return;
    }
    // Leave pending true through the close so the button doesn't flash.
    toast.success("Transfer recorded");
    reset();
    setPending(false);
    onClose();
    onTransferred();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer between funds</DialogTitle>
          <DialogDescription>
            Move money from one fund to another. Both funds&apos; balances are
            re-attributed and the transfer is recorded against each account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1.5">
              <Label>
                From <span className="text-destructive">*</span>
              </Label>
              <Select
                value={fromId}
                onValueChange={(v) => {
                  setFromId(v ?? "");
                  if (v === toId) setToId("");
                  if (fromInvalid) setFromInvalid(false);
                }}
              >
                <SelectTrigger aria-invalid={fromInvalid || undefined}>
                  <SelectValue placeholder="Source fund" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{FUND_LABEL[a.fund_type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="mb-2.5 h-4 w-4 text-muted-foreground" />
            <div className="space-y-1.5">
              <Label>
                To <span className="text-destructive">*</span>
              </Label>
              <Select
                value={toId}
                onValueChange={(v) => { setToId(v ?? ""); if (toInvalid) setToInvalid(false); }}
                disabled={!fromId}
              >
                <SelectTrigger aria-invalid={toInvalid || undefined}>
                  <SelectValue placeholder="Destination fund" />
                </SelectTrigger>
                <SelectContent>
                  {toOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{FUND_LABEL[a.fund_type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {fromAccount && (
            <p className="text-xs text-muted-foreground">
              {FUND_LABEL[fromAccount.fund_type]} balance:{" "}
              <span className="font-medium text-foreground">
                {formatCurrency(fromAccount.current_balance)}
              </span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-amount">
                Amount <span className="text-destructive">*</span>
              </Label>
              <NumberInput
                id="transfer-amount"
                thousandsSeparator
                prefix="$"
                placeholder="Amount"
                value={amount}
                onChange={(v) => { setAmount(v); if (amountInvalid) setAmountInvalid(false); }}
                invalid={amountInvalid}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-date">
                Transfer date <span className="text-destructive">*</span>
              </Label>
              <DatePicker
                id="transfer-date"
                value={transferDate}
                onChange={(v) => { setTransferDate(v); if (dateInvalid) setDateInvalid(false); }}
                error={dateInvalid}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Reason</Label>
            <Textarea
              id="transfer-reason"
              placeholder="Why the funds are being moved"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => { if (!pending) { reset(); onClose(); } }} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
