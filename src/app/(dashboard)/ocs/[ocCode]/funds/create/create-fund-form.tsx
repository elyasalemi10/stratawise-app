"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Landmark, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  createFund,
  type LotForFund,
  type ExistingBankAccountOption,
} from "@/lib/actions/funds";
import { FUND_KIND_LABEL, type FundKind } from "@/lib/funds-shared";

type LotEntitlement = {
  selected: boolean;
  liability: string;
};

type Step = "kind" | "lots" | "bank";

export function CreateFundForm({
  ocId,
  ocCode,
  lots,
  bankOptions,
  existingKinds,
}: {
  ocId: string;
  ocCode: string;
  lots: LotForFund[];
  bankOptions: ExistingBankAccountOption[];
  existingKinds: FundKind[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("kind");

  const existingSet = new Set(existingKinds);
  const kindChoices = ([
    { value: "administrative" as FundKind, label: FUND_KIND_LABEL.administrative, disabled: existingSet.has("administrative") },
    { value: "capital_works" as FundKind, label: FUND_KIND_LABEL.capital_works, disabled: existingSet.has("capital_works") },
    { value: "maintenance_plan" as FundKind, label: FUND_KIND_LABEL.maintenance_plan, disabled: existingSet.has("maintenance_plan") },
    { value: "custom" as FundKind, label: "Other (custom fund)", disabled: false },
  ] as Array<{ value: FundKind; label: string; disabled: boolean }>).filter((k) => !k.disabled);

  // Default to the first available kind. If everything's taken except
  // custom, default to custom.
  const [kind, setKind] = useState<FundKind>(kindChoices[0]?.value ?? "custom");
  const [customName, setCustomName] = useState("");

  const [entitlements, setEntitlements] = useState<Record<string, LotEntitlement>>(() =>
    Object.fromEntries(
      lots.map((l) => [l.id, { selected: true, liability: String(l.default_liability) }]),
    ),
  );

  // New funds default to creating a fresh bank account , the manager
  // can switch to "share" if they want to link to an existing one.
  const [bankMode, setBankMode] = useState<"new" | "shared">("new");
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

  function goNextFromKind() {
    if (kind === "custom" && !customName.trim()) {
      toast.error("Name this fund before continuing.");
      return;
    }
    setStep("lots");
  }
  function goNextFromLots() {
    if (includedCount === 0) {
      toast.error("Tick at least one lot for this fund.");
      return;
    }
    setStep("bank");
  }

  function handleSubmit() {
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
    if (Object.keys(ent).length === 0) {
      toast.error("Pick at least one member lot.");
      return;
    }
    if (bankMode === "new") {
      if (!bsb.trim() || !accountNumber.trim()) {
        toast.error("BSB and account number are required for a new bank account.");
        return;
      }
    } else if (!sharedParentId) {
      toast.error("Pick a bank account to share with.");
      return;
    }

    startTransition(async () => {
      const res = await createFund(ocId, {
        kind,
        customName: kind === "custom" ? customName.trim() : undefined,
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

  const stepNumber = step === "kind" ? 1 : step === "lots" ? 2 : 3;
  const stepLabel = step === "kind" ? "Fund type" : step === "lots" ? "Member lots" : "Bank account";

  return (
    <div className={cn("space-y-6", pending && "pointer-events-none opacity-90")}>
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Step {stepNumber} of 3</span>
        <span>·</span>
        <span>{stepLabel}</span>
      </div>

      {step === "kind" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>Fund type <span className="text-destructive">*</span></Label>
              <Select value={kind} onValueChange={(v) => setKind((v as FundKind) ?? "custom")}>
                <SelectTrigger>
                  <SelectValue>
                    {kind === "custom" ? "Other (custom fund)" : FUND_KIND_LABEL[kind]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {kindChoices.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {kind === "custom" && (
              <div className="space-y-1.5">
                <Label>Fund name <span className="text-destructive">*</span></Label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Fund name"
                />
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={goNextFromKind}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "lots" && (
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
                          <Checkbox
                            checked={e?.selected ?? false}
                            onCheckedChange={(v) => toggleLot(l.id, v === true)}
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
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("kind")}>Back</Button>
              <Button onClick={goNextFromLots}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "bank" && (
        <div className="space-y-4">
          {/* Two large picker cards , New vs Share. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setBankMode("new")}
              className={cn(
                "flex h-full flex-col items-start gap-2 rounded-md border bg-card p-4 text-left transition-colors cursor-pointer",
                bankMode === "new" ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
              )}
            >
              <Landmark className="h-5 w-5 text-primary" />
              <div className="text-sm font-medium text-foreground">Create new bank account</div>
              <p className="text-xs text-muted-foreground">Add a fresh bank account dedicated to this fund.</p>
            </button>
            <button
              type="button"
              onClick={() => bankOptions.length > 0 && setBankMode("shared")}
              disabled={bankOptions.length === 0}
              className={cn(
                "flex h-full flex-col items-start gap-2 rounded-md border bg-card p-4 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
                bankMode === "shared" ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
              )}
            >
              <LinkIcon className="h-5 w-5 text-primary" />
              <div className="text-sm font-medium text-foreground">Share with another fund</div>
              <p className="text-xs text-muted-foreground">
                {bankOptions.length === 0
                  ? "No existing bank accounts to share with yet."
                  : "Link this fund to an existing bank account. Updates flow through automatically."}
              </p>
            </button>
          </div>

          <Card>
            <CardContent className="pt-5 space-y-4">
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
                      <SelectValue placeholder="Pick a bank account">
                        {bankOptions.find((b) => b.id === sharedParentId)?.label ?? null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {bankOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.label}{b.bsb && b.account_number ? ` , ${b.bsb} ${b.account_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep("lots")} disabled={pending}>Back</Button>
            <Button onClick={handleSubmit} disabled={pending} size="lg">
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create fund
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
