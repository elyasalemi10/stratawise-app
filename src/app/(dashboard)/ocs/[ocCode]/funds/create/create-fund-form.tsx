"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wallet, Users, Landmark, ListChecks, Building2, Wrench, MoreHorizontal, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { BankSelect } from "@/components/shared/bank-select";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createFund, type LotForFund, type ExistingBankAccountOption } from "@/lib/actions/funds";
import { FUND_KIND_LABEL, type FundKind } from "@/lib/funds-shared";
import { AUSTRALIAN_BANKS } from "@/lib/data/australian-banks";

type LotEntitlement = {
  selected: boolean;
  liability: string;
};

type Step = "kind" | "lots" | "bankChoice" | "bankDetails";

const STEPS: Array<{ key: Step; number: number; label: string; icon: LucideIcon }> = [
  { key: "kind", number: 1, label: "Fund type", icon: Wallet },
  { key: "lots", number: 2, label: "Lots", icon: Users },
  { key: "bankChoice", number: 3, label: "Bank choice", icon: ListChecks },
  { key: "bankDetails", number: 4, label: "Bank details", icon: Landmark },
];

function StepIndicator({ current }: { current: Step }) {
  const currentNumber = STEPS.find((s) => s.key === current)?.number ?? 1;
  return (
    <div className="mb-6 flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
      {STEPS.map((s, i) => {
        const isDone = s.number < currentNumber;
        const isCurrent = s.number === currentNumber;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                  (isDone || isCurrent) && "bg-primary text-primary-foreground",
                  !isDone && !isCurrent && "border-2 border-dashed border-border bg-background text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <span
                className={cn(
                  "text-sm whitespace-nowrap select-text",
                  isCurrent && "font-semibold text-foreground",
                  isDone && "font-medium text-primary",
                  !isDone && !isCurrent && "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mt-6 h-px w-10 shrink-0 border-t-2",
                  isDone ? "border-solid border-primary" : "border-dashed border-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

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
    { value: "admin" as FundKind, label: FUND_KIND_LABEL.admin, disabled: existingSet.has("admin") },
    { value: "maintenance_plan" as FundKind, label: FUND_KIND_LABEL.maintenance_plan, disabled: existingSet.has("maintenance_plan") },
    { value: "custom" as FundKind, label: "Other (custom fund)", disabled: false },
  ] as Array<{ value: FundKind; label: string; disabled: boolean }>).filter((k) => !k.disabled);

  const [kind, setKind] = useState<FundKind>(kindChoices[0]?.value ?? "custom");
  const [customName, setCustomName] = useState("");

  const [entitlements, setEntitlements] = useState<Record<string, LotEntitlement>>(() =>
    Object.fromEntries(
      lots.map((l) => [l.id, { selected: true, liability: String(l.default_liability) }]),
    ),
  );

  // Bank: choice step first (yes/no share), then details step.
  // bankMode is undefined until the manager picks ("" sentinel) so we
  // don't auto-select and force them to make the call.
  const [bankMode, setBankMode] = useState<"new" | "shared" | "">("");
  const [sharedParentId, setSharedParentId] = useState<string>("");
  const [bsb, setBsb] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");

  const [pending, startTransition] = useTransition();

  const includedCount = Object.values(entitlements).filter((e) => e.selected).length;

  function toggleLot(lotId: string, checked: boolean) {
    setEntitlements((p) => ({ ...p, [lotId]: { ...p[lotId], selected: checked } }));
  }
  function updateLiability(lotId: string, v: string) {
    setEntitlements((p) => ({ ...p, [lotId]: { ...p[lotId], liability: v } }));
  }

  function goNextFromKind() {
    setStep("lots");
  }
  function goNextFromLots() {
    if (kind === "custom" && !customName.trim()) {
      toast.error("Name this fund before continuing.");
      return;
    }
    if (includedCount === 0) {
      toast.error("Tick at least one lot for this fund.");
      return;
    }
    setStep("bankChoice");
  }
  function goNextFromBankChoice() {
    if (!bankMode) {
      toast.error("Pick whether this fund uses a new account or shares an existing one.");
      return;
    }
    if (bankMode === "shared" && bankOptions.length === 0) {
      toast.error("No existing bank accounts to share with , create a new one instead.");
      return;
    }
    setStep("bankDetails");
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
    if (bankMode === "new") {
      if (!bsb.trim() || !accountNumber.trim()) {
        toast.error("BSB and account number are required.");
        return;
      }
    } else if (bankMode === "shared") {
      if (!sharedParentId) {
        toast.error("Pick the bank account to share with.");
        return;
      }
    }

    // bankName from BankSelect is an id (e.g. "macquarie") or "other".
    // Map it to the human-readable bank name for storage; ignore "other"
    // so we don't write the literal word as the bank.
    const resolvedBankName =
      bankName && bankName !== "other"
        ? (AUSTRALIAN_BANKS.find((b) => b.id === bankName)?.name ?? bankName)
        : undefined;

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
                bank_name: resolvedBankName,
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

  // Sticky footer pattern matches the OC wizard , Back on the left,
  // Next/Create on the right. Cancel-via-click-off doesn't apply here
  // because the wizard is a full page, not a drawer.

  return (
    <div className={cn("space-y-6", pending && "pointer-events-none opacity-90")}>
      <StepIndicator current={step} />

      {step === "kind" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label>Fund type <span className="text-destructive">*</span></Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { value: "admin" as FundKind, label: FUND_KIND_LABEL.admin, icon: Building2, blurb: "Day-to-day OC running costs , insurance, cleaning, admin, manager fees." },
                { value: "maintenance_plan" as FundKind, label: FUND_KIND_LABEL.maintenance_plan, icon: Wrench, blurb: "Scheduled maintenance plan , recurring upkeep based on a 10-year plan." },
                { value: "custom" as FundKind, label: "Other (custom fund)", icon: MoreHorizontal, blurb: "A purpose-specific fund , e.g. driveway, pool, lift modernisation." },
              ].map((k) => {
                const Icon = k.icon;
                const disabled = k.value !== "custom" && existingSet.has(k.value);
                const selected = kind === k.value;
                return (
                  <button
                    key={k.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "flex h-full flex-col items-start gap-2 rounded-md border bg-card p-4 text-left transition-colors cursor-pointer",
                      selected ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40",
                      disabled && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <div className="text-sm font-medium text-foreground">{k.label}</div>
                    <p className="text-xs text-muted-foreground">{k.blurb}</p>
                    {disabled && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Already exists</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button onClick={goNextFromKind}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "lots" && (
        <Card>
          <CardContent className="pt-5 space-y-3">
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

      {step === "bankChoice" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <Label>Does this fund share a bank account with another fund? <span className="text-destructive">*</span></Label>
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
                <div className="text-sm font-medium text-foreground">No, new bank account</div>
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
                <ListChecks className="h-5 w-5 text-primary" />
                <div className="text-sm font-medium text-foreground">Yes, share with another fund</div>
                <p className="text-xs text-muted-foreground">
                  {bankOptions.length === 0
                    ? "No existing accounts to share with yet."
                    : "Link this fund to an existing bank account. Updates flow through automatically."}
                </p>
              </button>
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("lots")}>Back</Button>
              <Button onClick={goNextFromBankChoice} disabled={!bankMode}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "bankDetails" && (
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
                  {/* BankSelect renders each Australian bank with its
                      logo + an "Other" fallback. The id maps to a
                      stable bank.name resolved at submit time so the
                      stored bank_name stays human-readable. */}
                  <BankSelect
                    value={bankName}
                    onChange={setBankName}
                    includeOther
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
                <Combobox
                  items={bankOptions}
                  value={sharedParentId}
                  onValueChange={(v) => setSharedParentId(v ?? "")}
                >
                  <ComboboxInput placeholder="Pick a bank account" />
                  <ComboboxContent>
                    <ComboboxEmpty>No bank accounts found.</ComboboxEmpty>
                    <ComboboxList>
                      {(b: ExistingBankAccountOption) => {
                        // Try to match the stored bank_name to one of
                        // our Australian banks (Macquarie / NAB / etc)
                        // so the shared picker shows a logo too.
                        const logo = b.bank_name
                          ? AUSTRALIAN_BANKS.find(
                              (bk) => bk.name.toLowerCase() === b.bank_name!.toLowerCase(),
                            )?.logo
                          : null;
                        return (
                          <ComboboxItem
                            key={b.id}
                            value={b.id}
                            keywords={[
                              b.label,
                              b.bsb ?? "",
                              b.account_number ?? "",
                              b.bank_name ?? "",
                            ]}
                          >
                            <span className="flex items-center gap-2 w-full">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt="" width={20} height={20} className="rounded shrink-0" />
                              ) : (
                                <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="flex flex-1 items-center gap-3 min-w-0">
                                <span className="truncate text-foreground">{b.label}</span>
                                {b.bsb && b.account_number && (
                                  <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{b.bsb} {b.account_number}</span>
                                )}
                              </span>
                            </span>
                          </ComboboxItem>
                        );
                      }}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <p className="text-xs text-muted-foreground">
                  Changes to the linked account (BSB, account number, balance) flow through automatically.
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep("bankChoice")} disabled={pending}>Back</Button>
              <Button onClick={handleSubmit} disabled={pending} size="lg">
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create fund
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
