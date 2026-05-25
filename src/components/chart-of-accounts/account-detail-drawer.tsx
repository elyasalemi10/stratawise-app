"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Lock, Pencil, Loader2 } from "lucide-react";
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

// Detail drawer that opens when a manager clicks a chart-of-accounts row.
// Default state is read-only. Pencil icon next to a field flips that field
// (and only that field) into edit mode. Save button at the bottom commits
// every changed field in one round trip.
//
// The active/inactive Switch is right in the header so the manager doesn't
// have to enter edit mode just to deactivate something.
export function AccountDetailDrawer({ account, onOpenChange, onAccountUpdated, onAccountActiveChanged }: Props) {
  const open = account !== null;

  // Each field has its own "edit mode" flag so the manager can flip ONE
  // field without disturbing the others. Built-in accounts keep their code
  // locked even in edit mode.
  const [editingCode, setEditingCode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [editingGst, setEditingGst] = useState(false);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<CoaAccountType>("expense");
  const [gst, setGst] = useState<CoaGstTreatment>("bas_excluded");

  const [savePending, setSavePending] = useState(false);
  const [, startToggle] = useTransition();
  const [togglePending, setTogglePending] = useState(false);

  // Reset when a new account is opened.
  useEffect(() => {
    if (account) {
      setCode(account.code);
      setName(account.name);
      setAccountType(account.account_type);
      setGst(account.gst_treatment);
      setEditingCode(false);
      setEditingName(false);
      setEditingType(false);
      setEditingGst(false);
    }
  }, [account]);

  if (!account) return null;

  const locked = isProtectedSystemAccount(account);
  const active = !account.archived_at;
  const dirty =
    code !== account.code ||
    name !== account.name ||
    accountType !== account.account_type ||
    gst !== account.gst_treatment;
  const rangeWarning = mismatchMessage(accountType, code);
  const codeEditable = !locked; // built-in code stays put

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
    onOpenChange(false);
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

  function PencilButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label="Edit"
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40 cursor-pointer"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b border-border pb-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <SheetTitle className="flex items-center gap-2">
                {locked && <Lock className="size-3.5 text-muted-foreground" aria-label="Built-in account" />}
                <span>{account.name}</span>
              </SheetTitle>
              <SheetDescription>
                Code <span className="font-mono">{account.code}</span> , {ACCOUNT_TYPE_LABEL[account.account_type]}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">{active ? "Active" : "Inactive"}</span>
              <Switch
                checked={active}
                onCheckedChange={handleToggleActive}
                disabled={(locked && active) || togglePending}
                aria-label="Account active"
              />
            </div>
          </div>
          {locked && active && (
            <p className="mt-1 text-xs text-muted-foreground">
              This is a built-in account, the platform uses it directly so it can&apos;t be deactivated.
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Code</Label>
              {!editingCode && <PencilButton onClick={() => setEditingCode(true)} disabled={!codeEditable} />}
            </div>
            {editingCode ? (
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

          {/* Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Name</Label>
              {!editingName && <PencilButton onClick={() => setEditingName(true)} />}
            </div>
            {editingName ? (
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" maxLength={120} />
            ) : (
              <p className="text-sm text-foreground">{account.name}</p>
            )}
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Type</Label>
              {!editingType && <PencilButton onClick={() => setEditingType(true)} />}
            </div>
            {editingType ? (
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

          {/* GST */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>GST treatment</Label>
              {!editingGst && <PencilButton onClick={() => setEditingGst(true)} />}
            </div>
            {editingGst ? (
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

          {/* System role (read-only , surfaced for transparency) */}
          {account.system_role && (
            <div className="space-y-1.5">
              <Label>System role</Label>
              <p className="font-mono text-xs text-muted-foreground">{account.system_role}</p>
              <p className="text-xs text-muted-foreground">
                The platform references this account by role to wire up trust ledgers, levy income, GST.
              </p>
            </div>
          )}

          {rangeWarning && (editingCode || editingType) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{rangeWarning}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={savePending}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={!dirty || savePending}>
            {savePending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
