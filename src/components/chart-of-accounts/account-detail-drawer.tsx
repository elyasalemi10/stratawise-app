"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_OPTIONS,
  GST_TREATMENT_LABEL, GST_TREATMENT_OPTIONS,
  isProtectedSystemAccount, mismatchMessage,
  type CoaAccount, type CoaAccountType, type CoaGstTreatment,
} from "@/lib/chart-of-accounts";
import { setCoaAccountActive, updateCoaAccount } from "@/lib/actions/chart-of-accounts";

interface Props {
  account: CoaAccount | null;
  onOpenChange: (open: boolean) => void;
  onAccountUpdated: (account: CoaAccount) => void;
  onAccountActiveChanged: (id: string, archivedAt: string | null) => void;
}

// Detail drawer for a chart-of-accounts row. Default state is read-only with
// a single pencil that flips the WHOLE drawer into edit mode (Save appears on
// the right; Cancel restores the original values). Built-in accounts (rows
// with a system_role) don't render the pencil at all. The X-close button is
// suppressed via the sheet's `showCloseButton={false}` prop, so dismissal is
// only via the Close button / overlay click.
export function AccountDetailDrawer({ account, onOpenChange, onAccountUpdated, onAccountActiveChanged }: Props) {
  const open = account !== null;

  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<CoaAccountType>("expense");
  const [gst, setGst] = useState<CoaGstTreatment>("bas_excluded");

  const [savePending, setSavePending] = useState(false);
  const [, startToggle] = useTransition();
  const [togglePending, setTogglePending] = useState(false);

  // Reset when a new account opens. Loaded snapshot becomes the "saved state"
  // we fall back to on Cancel.
  useEffect(() => {
    if (account) {
      setCode(account.code);
      setName(account.name);
      setAccountType(account.account_type);
      setGst(account.gst_treatment);
      setEditing(false);
    }
  }, [account]);

  if (!account) return null;

  const locked = isProtectedSystemAccount(account);
  const active = !account.archived_at;
  const rangeWarning = mismatchMessage(accountType, code);

  async function handleSave() {
    if (!account) return;
    setSavePending(true);
    const res = await updateCoaAccount({
      id: account.id,
      code,
      name,
      account_type: accountType,
      gst_treatment: gst,
    });
    setSavePending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Account updated");
    onAccountUpdated(res.account!);
    setEditing(false);
  }

  function handleCancel() {
    // Snap back to the saved snapshot.
    if (account) {
      setCode(account.code);
      setName(account.name);
      setAccountType(account.account_type);
      setGst(account.gst_treatment);
    }
    setEditing(false);
  }

  function handleToggleActive(next: boolean) {
    setTogglePending(true);
    startToggle(async () => {
      const res = await setCoaAccountActive(account!.id, next);
      setTogglePending(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const stamp = next ? null : new Date().toISOString();
      onAccountActiveChanged(account!.id, stamp);
      toast.success(next ? "Account activated" : "Account deactivated");
    });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <SheetContent side="right" showCloseButton={false} className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-start gap-3">
            <SheetTitle className="flex-1">Account {account.code}</SheetTitle>
            {/* Visually-hidden description , the SheetDescription element is
                required for accessibility; the visible copy is removed. */}
            <SheetDescription className="sr-only">
              {account.name}
            </SheetDescription>
            {!editing && !locked && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit account"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted cursor-pointer"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            <Label>Code</Label>
            {editing ? (
              <NumberInput
                value={code}
                onChange={setCode}
                allowDecimal={false}
                maxLength={4}
                placeholder="4-digit code"
              />
            ) : (
              <p className="font-mono text-sm text-foreground">{account.code}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Name</Label>
            {editing ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" maxLength={120} />
            ) : (
              <p className="text-sm text-foreground">{account.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            {editing ? (
              <Select value={accountType} onValueChange={(v) => setAccountType((v as CoaAccountType) ?? "expense")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{ACCOUNT_TYPE_LABEL[accountType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-foreground">{ACCOUNT_TYPE_LABEL[account.account_type]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>GST treatment</Label>
            {editing ? (
              <Select value={gst} onValueChange={(v) => setGst((v as CoaGstTreatment) ?? "bas_excluded")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{GST_TREATMENT_LABEL[gst]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GST_TREATMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-foreground">{GST_TREATMENT_LABEL[account.gst_treatment]}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <Label>Active</Label>
            <Switch
              checked={active}
              onCheckedChange={handleToggleActive}
              disabled={(locked && active) || togglePending}
              aria-label="Account active"
            />
          </div>

          {rangeWarning && editing && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{rangeWarning}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          {editing ? (
            <>
              <Button variant="secondary" onClick={handleCancel} disabled={savePending}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={savePending}>
                {savePending && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
