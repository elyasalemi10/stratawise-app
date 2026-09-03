"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBankAccount } from "./actions";
import { bankFromBsb } from "@/lib/data/australian-banks";

function formatBsb(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 6);
  return d.length <= 3 ? d : `${d.slice(0, 3)}-${d.slice(3)}`;
}

export function AddBankAccountDrawer({
  ocId,
  open,
  onOpenChange,
  onCreated,
}: {
  ocId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [accountName, setAccountName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [invalid, setInvalid] = useState<{ name?: boolean; bsb?: boolean; acc?: boolean }>({});
  const [pending, startTransition] = useTransition();

  function reset() {
    setAccountName("");
    setBsb("");
    setAccountNumber("");
    setInvalid({});
  }

  function submit() {
    const issues: typeof invalid = {};
    if (accountName.trim().length === 0) issues.name = true;
    if (bsb.replace(/\D/g, "").length !== 6) issues.bsb = true;
    if (!/^\d{6,9}$/.test(accountNumber.replace(/\D/g, ""))) issues.acc = true;
    setInvalid(issues);
    if (Object.keys(issues).length > 0) {
      toast.error("Fix the highlighted fields.");
      return;
    }

    startTransition(async () => {
      const res = await createBankAccount(ocId, {
        account_name: accountName.trim(),
        bsb,
        account_number: accountNumber,
        // Derived from the BSB rather than asked for.
        bank_name: bankFromBsb(bsb)?.name ?? null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Bank account added");
      reset();
      onCreated(res.id!);
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <SheetContent side="right" className="w-[440px] sm:max-w-none">
        <SheetHeader>
          <SheetTitle>Add bank account</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-name">
              Account name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="add-name"
              placeholder="Account name as it appears on bank statements"
              value={accountName}
              onChange={(e) => { setAccountName(e.target.value); if (invalid.name) setInvalid({ ...invalid, name: false }); }}
              aria-invalid={invalid.name || undefined}
            />
          </div>
          <div className="grid grid-cols-[160px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-bsb">
                BSB <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-bsb"
                placeholder="6-digit BSB"
                value={bsb}
                onChange={(e) => { setBsb(formatBsb(e.target.value)); if (invalid.bsb) setInvalid({ ...invalid, bsb: false }); }}
                inputMode="numeric"
                maxLength={7}
                aria-invalid={invalid.bsb || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-acc">
                Account number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-acc"
                placeholder="Bank account number"
                value={accountNumber}
                onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 9)); if (invalid.acc) setInvalid({ ...invalid, acc: false }); }}
                inputMode="numeric"
                aria-invalid={invalid.acc || undefined}
              />
            </div>
          </div>

        </div>

        <SheetFooter className="border-t border-border px-5 py-3">
          <Button onClick={submit} disabled={pending} className="w-full" loading={pending}>
            Add bank account
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
