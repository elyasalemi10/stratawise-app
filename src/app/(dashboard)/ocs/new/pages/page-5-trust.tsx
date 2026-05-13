"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { saveStep, type DraftJson } from "../actions";

// Common AU BSB prefixes → bank name. Not exhaustive — covers ~95% of real
// trust-account openings. Full table (~2k entries) deferred.
const BSB_PREFIXES: Record<string, string> = {
  "01": "ANZ",
  "03": "Westpac",
  "06": "CBA",
  "08": "NAB",
  "18": "Macquarie Bank",
  "63": "Bendigo Bank",
  "73": "Westpac",
  "76": "Westpac",
};

const BANKS: { value: string; label: string; recommended?: boolean }[] = [
  { value: "Macquarie Bank", label: "Macquarie Bank", recommended: true },
  { value: "CBA", label: "Commonwealth Bank" },
  { value: "NAB", label: "NAB" },
  { value: "Westpac", label: "Westpac" },
  { value: "ANZ", label: "ANZ" },
  { value: "Bendigo Bank", label: "Bendigo Bank" },
  { value: "Other", label: "Other" },
];

function lookupBank(bsb: string): string | null {
  const digits = bsb.replace(/\D/g, "");
  if (digits.length < 2) return null;
  return BSB_PREFIXES[digits.slice(0, 2)] ?? null;
}
function formatBsb(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 6);
  return d.length <= 3 ? d : `${d.slice(0, 3)}-${d.slice(3)}`;
}
function isValidBsb(s: string): boolean {
  return s.replace(/\D/g, "").length === 6;
}
function isValidAccountNumber(s: string): boolean {
  return /^\d{6,9}$/.test(s.replace(/\D/g, ""));
}

export function Page5Trust({
  draftId,
  initialDraft,
  ocName,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  ocName: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const [bank, setBank] = useState(initialDraft.bank_name ?? "Macquarie Bank");
  const [shared, setShared] = useState(initialDraft.uses_shared_trust_account ?? true);

  // Admin fund (or shared) fields.
  const [accountName, setAccountName] = useState(
    initialDraft.account_name ?? (ocName ? `${ocName} Trust Account` : ""),
  );
  const [bsb, setBsb] = useState(initialDraft.bsb ?? "");
  const [accountNumber, setAccountNumber] = useState(initialDraft.account_number ?? "");

  // Capital works fund fields (only when !shared).
  const [capitalBank, setCapitalBank] = useState(initialDraft.capital_bank_name ?? "Macquarie Bank");
  const [capitalAccountName, setCapitalAccountName] = useState(
    initialDraft.capital_account_name ?? (ocName ? `${ocName} Capital Works Trust Account` : ""),
  );
  const [capitalBsb, setCapitalBsb] = useState(initialDraft.capital_bsb ?? "");
  const [capitalAccountNumber, setCapitalAccountNumber] = useState(initialDraft.capital_account_number ?? "");

  // Field-level invalid flags.
  const [adminInvalid, setAdminInvalid] = useState({ name: false, bsb: false, acc: false });
  const [capitalInvalid, setCapitalInvalid] = useState({ name: false, bsb: false, acc: false });

  const [pending, setPending] = useState(false);

  const detectedBank = useMemo(() => lookupBank(bsb), [bsb]);
  const detectedCapitalBank = useMemo(() => lookupBank(capitalBsb), [capitalBsb]);

  function onContinue() {
    const problems: string[] = [];
    const adminNameOk = accountName.trim().length >= 2;
    const adminBsbOk = isValidBsb(bsb);
    const adminAccOk = isValidAccountNumber(accountNumber);
    if (!adminNameOk) problems.push("Admin trust account name is required");
    if (!adminBsbOk) problems.push("Admin BSB must be 6 digits");
    if (!adminAccOk) problems.push("Admin account number must be 6–9 digits");
    setAdminInvalid({ name: !adminNameOk, bsb: !adminBsbOk, acc: !adminAccOk });

    let capNameOk = true, capBsbOk = true, capAccOk = true;
    if (!shared) {
      capNameOk = capitalAccountName.trim().length >= 2;
      capBsbOk = isValidBsb(capitalBsb);
      capAccOk = isValidAccountNumber(capitalAccountNumber);
      if (!capNameOk) problems.push("Capital works account name is required");
      if (!capBsbOk) problems.push("Capital works BSB must be 6 digits");
      if (!capAccOk) problems.push("Capital works account number must be 6–9 digits");
    }
    setCapitalInvalid({ name: !capNameOk, bsb: !capBsbOk, acc: !capAccOk });

    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    void (async () => {
      const r = await saveStep(draftId, {
        bank_provider: bank === "Macquarie Bank" ? "macquarie_deft" : "other_csv",
        uses_shared_trust_account: shared,
        bank_name: bank,
        account_name: accountName.trim(),
        bsb,
        account_number: accountNumber,
        capital_bank_name: shared ? bank : capitalBank,
        capital_account_name: shared ? accountName.trim() : capitalAccountName.trim(),
        capital_bsb: shared ? bsb : capitalBsb,
        capital_account_number: shared ? accountNumber : capitalAccountNumber,
      }, 6);
      setPending(false);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      onNext();
    })();
  }

  function FundBlock({
    title,
    bankValue, setBank,
    nameValue, setName, nameInvalid,
    bsbValue, setBsb, bsbInvalid, detected,
    accValue, setAcc, accInvalid,
    idPrefix,
  }: {
    title: string;
    bankValue: string; setBank: (v: string) => void;
    nameValue: string; setName: (v: string) => void; nameInvalid: boolean;
    bsbValue: string; setBsb: (v: string) => void; bsbInvalid: boolean; detected: string | null;
    accValue: string; setAcc: (v: string) => void; accInvalid: boolean;
    idPrefix: string;
  }) {
    return (
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-bank`}>Bank</Label>
          <select
            id={`${idPrefix}-bank`}
            value={bankValue}
            onChange={(e) => setBank(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {BANKS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}{b.recommended ? " — Recommended (Macquarie DEFT auto-reconciles)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-name`}>
            Account name <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-name`}
            value={nameValue}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameInvalid || undefined}
          />
        </div>
        <div className="grid grid-cols-[180px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-bsb`}>
              BSB <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-bsb`}
              placeholder="XXX-XXX"
              value={bsbValue}
              onChange={(e) => setBsb(formatBsb(e.target.value))}
              inputMode="numeric"
              maxLength={7}
              aria-invalid={bsbInvalid || undefined}
            />
            {detected && <p className="text-xs text-muted-foreground">Matches {detected}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-acc`}>
              Account number <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-acc`}
              placeholder="12345678"
              value={accValue}
              onChange={(e) => setAcc(e.target.value.replace(/\D/g, "").slice(0, 9))}
              inputMode="numeric"
              aria-invalid={accInvalid || undefined}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Set up the trust account{!shared && "s"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Trust accounts hold the OC&apos;s funds — separate from your management company&apos;s operating account.
        </p>
      </div>

      {/* Shared vs separate toggle. */}
      <div className="rounded-md border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="shared"
            checked={shared}
            onCheckedChange={(v) => setShared(v === true)}
          />
          <div>
            <Label htmlFor="shared" className="text-sm font-medium cursor-pointer">
              Use the same bank account for both funds
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              One physical trust account, two internal ledger balances (admin + capital works).
              Recommended for smaller OCs. Uncheck if the OC keeps separate trust accounts per fund.
            </p>
          </div>
        </div>
      </div>

      <FundBlock
        title={shared ? "Trust account (both funds)" : "Administrative fund trust account"}
        bankValue={bank} setBank={setBank}
        nameValue={accountName} setName={(v) => { setAccountName(v); if (adminInvalid.name) setAdminInvalid({ ...adminInvalid, name: false }); }}
        nameInvalid={adminInvalid.name}
        bsbValue={bsb} setBsb={(v) => { setBsb(v); if (adminInvalid.bsb) setAdminInvalid({ ...adminInvalid, bsb: false }); }}
        bsbInvalid={adminInvalid.bsb} detected={detectedBank}
        accValue={accountNumber} setAcc={(v) => { setAccountNumber(v); if (adminInvalid.acc) setAdminInvalid({ ...adminInvalid, acc: false }); }}
        accInvalid={adminInvalid.acc}
        idPrefix="admin"
      />

      {!shared && (
        <FundBlock
          title="Capital works fund trust account"
          bankValue={capitalBank} setBank={setCapitalBank}
          nameValue={capitalAccountName} setName={(v) => { setCapitalAccountName(v); if (capitalInvalid.name) setCapitalInvalid({ ...capitalInvalid, name: false }); }}
          nameInvalid={capitalInvalid.name}
          bsbValue={capitalBsb} setBsb={(v) => { setCapitalBsb(v); if (capitalInvalid.bsb) setCapitalInvalid({ ...capitalInvalid, bsb: false }); }}
          bsbInvalid={capitalInvalid.bsb} detected={detectedCapitalBank}
          accValue={capitalAccountNumber} setAcc={(v) => { setCapitalAccountNumber(v); if (capitalInvalid.acc) setCapitalInvalid({ ...capitalInvalid, acc: false }); }}
          accInvalid={capitalInvalid.acc}
          idPrefix="capital"
        />
      )}

      {bank === "Macquarie Bank" && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-green-700 shrink-0" />
            <div className="text-xs text-green-900">
              Macquarie&apos;s DEFT system tags every incoming transaction with the payer&apos;s
              <strong> DEFT Reference Number</strong>. You&apos;ll upload your DRN export CSV
              from Macquarie Business Online after setup, and we&apos;ll auto-allocate
              transactions from the TXN/PAY files you import each week.
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
