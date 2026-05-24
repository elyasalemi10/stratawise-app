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
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_OPTIONS, GST_TREATMENT_LABEL,
  GST_TREATMENT_OPTIONS, mismatchMessage,
  type CoaAccount, type CoaAccountType, type CoaGstTreatment,
} from "@/lib/chart-of-accounts";
import { createCoaAccount } from "@/lib/actions/chart-of-accounts";

const REQ = <span className="text-destructive">*</span>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lock the account type when launched from a context that only makes sense
   *  for one type (e.g. budget items pick expense accounts). */
  lockedType?: CoaAccountType;
  /** Pre-fill the account name (e.g. user typed "Insurance" into the budget
   *  combobox and clicked "Add new account"). */
  initialName?: string;
  /** Called after the account is created. */
  onCreated?: (account: CoaAccount) => void;
}

// Right-side drawer used both from the Chart of Accounts page and the budget
// create form. Fields: code, name, type, GST treatment. Inline warning (not a
// block) when the chosen type doesn't sit in the conventional code range.
export function CreateAccountDrawer({ open, onOpenChange, lockedType, initialName, onCreated }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  // No default account type: the manager must explicitly pick one so the
  // banding warning fires honestly.
  const [accountType, setAccountType] = useState<CoaAccountType | "">("");
  const [gst, setGst] = useState<CoaGstTreatment | "">("");
  const [pending, setPending] = useState(false);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [typeInvalid, setTypeInvalid] = useState(false);
  const [gstInvalid, setGstInvalid] = useState(false);

  // Reset to a clean slate each time the drawer opens. lockedType wins if the
  // caller passed one; initialName seeds the name field.
  useEffect(() => {
    if (open) {
      setCode("");
      setName(initialName ?? "");
      setAccountType(lockedType ?? "");
      setGst("");
      setPending(false);
      setCodeInvalid(false);
      setNameInvalid(false);
      setTypeInvalid(false);
      setGstInvalid(false);
    }
  }, [open, lockedType, initialName]);

  const rangeWarning = useMemo(() => {
    if (!/^[0-9]{4}$/.test(code) || !accountType) return null;
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
    if (!accountType) {
      setTypeInvalid(true);
      problems.push("Pick an account type.");
    }
    if (!gst) {
      setGstInvalid(true);
      problems.push("Pick a GST treatment.");
    }
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const res = await createCoaAccount({
      code,
      name: trimmedName,
      account_type: accountType as CoaAccountType,
      gst_treatment: gst as CoaGstTreatment,
    });
    if (res.error) {
      setPending(false);
      toast.error(res.error);
      return;
    }
    setPending(false);
    toast.success(`Added ${res.account!.code}, ${res.account!.name}`);
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
              Convention: 1000s assets, 2000s liabilities, 3000s equity, 4000s income, 5000s/6000s expenses.
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
              onValueChange={(v) => {
                setAccountType((v as CoaAccountType) ?? "");
                setTypeInvalid(false);
              }}
              disabled={!!lockedType}
            >
              <SelectTrigger id="coa-type" className="w-full" aria-invalid={typeInvalid || undefined}>
                <SelectValue placeholder="Pick a type">
                  {accountType ? ACCOUNT_TYPE_LABEL[accountType] : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS.map((opt) => (
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

          <div className="space-y-1.5">
            <Label htmlFor="coa-gst">GST treatment {REQ}</Label>
            <Select
              value={gst}
              onValueChange={(v) => {
                setGst((v as CoaGstTreatment) ?? "");
                setGstInvalid(false);
              }}
            >
              <SelectTrigger id="coa-gst" className="w-full" aria-invalid={gstInvalid || undefined}>
                <SelectValue placeholder="Pick a treatment">
                  {gst ? GST_TREATMENT_LABEL[gst] : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GST_TREATMENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
