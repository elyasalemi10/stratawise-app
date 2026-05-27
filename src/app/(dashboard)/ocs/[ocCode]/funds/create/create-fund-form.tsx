"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { createFund, type LotForFund, type ExistingBankAccountOption } from "@/lib/actions/funds";

type LotEntitlement = {
  selected: boolean;
  liability: string; // stored as string per the "empty until continue" rule
};

export function CreateFundForm({
  ocId,
  ocCode,
  lots,
  bankOptions,
}: {
  ocId: string;
  ocCode: string;
  lots: LotForFund[];
  bankOptions: ExistingBankAccountOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [entitlements, setEntitlements] = useState<Record<string, LotEntitlement>>(() =>
    Object.fromEntries(
      lots.map((l) => [l.id, { selected: true, liability: String(l.default_liability) }]),
    ),
  );

  const [bankMode, setBankMode] = useState<"new" | "shared">(bankOptions.length > 0 ? "shared" : "new");
  const [sharedParentId, setSharedParentId] = useState<string>(bankOptions[0]?.id ?? "");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");

  const [pending, startTransition] = useTransition();

  const includedCount = Object.values(entitlements).filter((e) => e.selected).length;

  function toggleLot(lotId: string, checked: boolean) {
    setEntitlements((p) => ({
      ...p,
      [lotId]: { ...p[lotId], selected: checked },
    }));
  }

  function updateLiability(lotId: string, v: string) {
    setEntitlements((p) => ({
      ...p,
      [lotId]: { ...p[lotId], liability: v },
    }));
  }

  function handleSubmit() {
    if (!name.trim()) {
      toast.error("Give this fund a name.");
      return;
    }
    if (includedCount === 0) {
      toast.error("Tick at least one lot for this fund.");
      return;
    }
    const ent: Record<string, number> = {};
    for (const [lotId, row] of Object.entries(entitlements)) {
      if (!row.selected) continue;
      const v = parseFloat(row.liability);
      if (!Number.isFinite(v) || v <= 0) {
        toast.error("Every member lot needs a liability above zero.");
        return;
      }
      ent[lotId] = v;
    }

    startTransition(async () => {
      const res = await createFund(ocId, {
        name: name.trim(),
        entitlements: ent,
        bank:
          bankMode === "new"
            ? {
                kind: "new",
                bsb,
                account_number: accountNumber,
                account_name: accountName,
                bank_name: bankName,
              }
            : { kind: "shared", parent_account_id: sharedParentId },
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Fund created");
      router.push(`/ocs/${ocCode}/funds`);
    });
  }

  return (
    <div className={`space-y-6 ${pending ? "pointer-events-none opacity-90" : ""}`}>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Fund name <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Fund name"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <Label>Member lots <span className="text-destructive">*</span></Label>
            <span className="text-xs text-muted-foreground">
              {includedCount} of {lots.length} included
            </span>
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <Table variant="bordered" className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 py-1" />
                  <TableHead className="py-1">Lot</TableHead>
                  <TableHead className="py-1 w-[180px] text-right">Liability for this fund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.map((l) => {
                  const e = entitlements[l.id];
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="py-1">
                        <input
                          type="checkbox"
                          checked={e?.selected ?? false}
                          onChange={(ev) => toggleLot(l.id, ev.target.checked)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="py-1 text-foreground">
                        Lot {l.lot_number}
                        {l.unit_number ? ` (Unit ${l.unit_number})` : ""}
                      </TableCell>
                      <TableCell className="py-1">
                        <NumberInput
                          value={e?.liability ?? ""}
                          onChange={(v) => updateLiability(l.id, v)}
                          thousandsSeparator
                          allowDecimal
                          disabled={!e?.selected}
                          placeholder="Liability"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <Label>Bank account <span className="text-destructive">*</span></Label>

          <Select value={bankMode} onValueChange={(v) => setBankMode((v as "new" | "shared") ?? "new")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Create a new bank account</SelectItem>
              {bankOptions.length > 0 && (
                <SelectItem value="shared">Use an existing bank account</SelectItem>
              )}
            </SelectContent>
          </Select>

          {bankMode === "new" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Account name</Label>
                <Input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Account name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>BSB <span className="text-destructive">*</span></Label>
                <NumberInput value={bsb} onChange={setBsb} allowDecimal={false} placeholder="BSB" />
              </div>
              <div className="space-y-1.5">
                <Label>Account number <span className="text-destructive">*</span></Label>
                <NumberInput value={accountNumber} onChange={setAccountNumber} allowDecimal={false} placeholder="Account number" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Link to <span className="text-destructive">*</span></Label>
              <Select value={sharedParentId} onValueChange={(v) => setSharedParentId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.label}{b.bsb && b.account_number ? ` , ${b.bsb} ${b.account_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Changes to the linked account (BSB, account number, balance) flow through to this fund automatically.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={pending} size="lg">
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Create fund
        </Button>
      </div>
    </div>
  );
}
