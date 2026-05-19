"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Landmark, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createTrustAccount, type TrustAccountRow } from "@/lib/actions/trust-accounts";

export function TrustAccountsContent({
  accounts: initial,
}: {
  accounts: TrustAccountRow[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initial);
  const [createOpen, setCreateOpen] = useState(false);

  function handleCreated(account: { id: string }) {
    // Re-fetch from server so the new account row carries server-derived
    // fields (created_at, etc.) instead of optimistic stubs.
    router.refresh();
    void account;
    setCreateOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Statutory trust accounts your firm holds funds in. Upload a bank
            statement (coming soon) and we&apos;ll auto-tag each transaction
            against the right OC and category.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New trust account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No trust accounts yet"
          description="Add the bank account your firm uses to hold OC funds. You can rename, set defaults, or archive later."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add your first trust account
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <TrustAccountCard
              key={account.id}
              account={account}
              onAccountsChange={setAccounts}
            />
          ))}
        </div>
      )}

      <CreateTrustAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

function TrustAccountCard({
  account,
  onAccountsChange,
}: {
  account: TrustAccountRow;
  onAccountsChange: (
    update: (prev: TrustAccountRow[]) => TrustAccountRow[],
  ) => void;
}) {
  void onAccountsChange;
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {account.name}
            </p>
            {account.bank_name && (
              <p className="text-xs text-muted-foreground">{account.bank_name}</p>
            )}
          </div>
          {account.is_default && (
            <span className="shrink-0 rounded-full bg-[color:var(--brand-gold)]/15 px-2 py-0.5 text-[10px] font-medium text-[color:var(--brand-gold)]">
              Default
            </span>
          )}
        </div>

        {(account.bsb || account.account_number) && (
          <p className="font-mono text-xs text-muted-foreground">
            {account.bsb ? account.bsb.replace(/(\d{3})(\d{3})/, "$1-$2") : "BSB —"}{" "}
            ·{" "}
            {account.account_number ?? "—"}
          </p>
        )}

        <div className="border-t border-border pt-3 grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Needs review</p>
            <p className="text-sm font-semibold text-foreground tabular-nums">
              {account.needs_review_count}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last statement</p>
            <p className="text-sm text-foreground">
              {account.last_statement_at
                ? new Date(account.last_statement_at).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-2">
          <p className="text-xs text-muted-foreground">
            Statement upload + auto-match queue ships next.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateTrustAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (account: { id: string }) => void;
}) {
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(""); setBankName(""); setBsb(""); setAccountNumber(""); setIsDefault(false);
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    startTransition(async () => {
      const res = await createTrustAccount({
        name: name.trim(),
        bank_name: bankName.trim() || undefined,
        bsb: bsb.trim() || undefined,
        account_number: accountNumber.trim() || undefined,
        is_default: isDefault,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Trust account created");
      reset();
      onCreated(res.data);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New trust account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="trust-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="trust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Trust account name"
            />
            <p className="text-xs text-muted-foreground">
              Used in the dashboard + on the trust audit report.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trust-bank">Bank</Label>
            <Input
              id="trust-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Bank name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trust-bsb">BSB</Label>
              <Input
                id="trust-bsb"
                value={bsb}
                onChange={(e) => setBsb(e.target.value)}
                placeholder="6-digit BSB"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trust-acc">Account number</Label>
              <Input
                id="trust-acc"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Account number"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
              className="mt-0.5 bg-card"
            />
            <span className="text-sm text-foreground">
              Set as the firm&apos;s default trust account
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
