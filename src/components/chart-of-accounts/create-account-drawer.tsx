"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  ACCOUNT_TYPE_LABEL, type CoaAccount, type CoaAccountType,
  createCoaAccount, mismatchMessage,
} from "@/lib/actions/chart-of-accounts";

const REQ = <span className="text-destructive">*</span>;

const TYPE_OPTIONS: { value: CoaAccountType; label: string }[] = [
  { value: "asset", label: ACCOUNT_TYPE_LABEL.asset },
  { value: "liability", label: ACCOUNT_TYPE_LABEL.liability },
  { value: "equity", label: ACCOUNT_TYPE_LABEL.equity },
  { value: "income", label: ACCOUNT_TYPE_LABEL.income },
  { value: "expense", label: ACCOUNT_TYPE_LABEL.expense },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lock the account type when launched from a context that only makes sense
   *  for one type (e.g. budget items pick expense accounts). */
  lockedType?: CoaAccountType;
  /** Called after the account is created — receives the new account so the
   *  caller can immediately add it as a line item. */
  onCreated?: (account: CoaAccount) => void;
}

// Right-side drawer used both from the Chart of Accounts page and the budget
// create form. Exact field set the user specified: code, name, type. Inline
// warning (not a block) when the chosen type doesn't sit in the conventional
// range for that code.
export function CreateAccountDrawer({ open, onOpenChange, lockedType, onCreated }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<CoaAccountType>(lockedType ?? "expense");
  const [pending, setPending] = useState(false);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);

  // Reset to a clean slate each time the drawer opens so the previous attempt
  // doesn't leak in. lockedType wins if the caller passed one.
  useEffect(() => {
    if (open) {
      setCode("");
      setName("");
      setAccountType(lockedType ?? "expense");
      setPending(false);
      setCodeInvalid(false);
      setNameInvalid(false);
    }
  }, [open, lockedType]);

  // Live-derived, non-red hint. Only paints once the user has typed a valid
  // 4-digit code — partial codes wouldn't be a useful warning.
  const rangeWarning = useMemo(() => {
    if (!/^[0-9]{4}$/.test(code)) return null;
    return mismatchMessage(accountType, code);
  }, [code, accountType]);

  async function handleCreate() {
    const problems: string[] = [];
    const trimmedName = name.trim();
    if (!/^[0-9]{4}$/.test(code)) {
      setCodeInvalid(true);
      problems.push("Enter a 4-digit code.");
    }
    if (!trimmedName) {
      setNameInvalid(true);
      problems.push("Enter an account name.");
    }
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const res = await createCoaAccount({ code, name: trimmedName, account_type: accountType });
    if (res.error) {
      setPending(false);
      toast.error(res.error);
      return;
    }
    setPending(false);
    toast.success(`Added ${res.account!.code} — ${res.account!.name}`);
    onCreated?.(res.account!);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add account</SheetTitle>
          <SheetDescription>
            New accounts join this company&apos;s chart of accounts and are available across every OC you manage.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="coa-code">Code {REQ}</Label>
            <NumberInput
              id="coa-code"
              value={code}
              onChange={(v) => { setCode(v); setCodeInvalid(false); }}
              allowDecimal={false}
              placeholder="4-digit code"
              invalid={codeInvalid}
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground">
              Convention: 1000s assets · 2000s liabilities · 3000s equity · 4000s income · 5000s/6000s expenses.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coa-name">Name {REQ}</Label>
            <Input
              id="coa-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameInvalid(false); }}
              placeholder="Account name"
              aria-invalid={nameInvalid || undefined}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coa-type">Type {REQ}</Label>
            <Select
              value={accountType}
              onValueChange={(v) => setAccountType((v as CoaAccountType) ?? "expense")}
              disabled={!!lockedType}
            >
              <SelectTrigger id="coa-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lockedType && (
              <p className="text-xs text-muted-foreground">
                Locked to {ACCOUNT_TYPE_LABEL[lockedType]} for this flow.
              </p>
            )}
          </div>

          {rangeWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{rangeWarning}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add account
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
