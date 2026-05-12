"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { saveStep, completeWizard, type DraftJson } from "../actions";

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
  "63-2": "Bendigo Bank",
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
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

export function Page5Trust({
  draftId,
  initialDraft,
  ocName,
  onBack,
  onComplete,
}: {
  draftId: string;
  initialDraft: DraftJson;
  ocName: string;
  onBack: () => void;
  onComplete: (ocCode: string) => void;
}) {
  const [bank, setBank] = useState(initialDraft.bank_name ?? "Macquarie Bank");
  const [accountName, setAccountName] = useState(
    initialDraft.account_name ?? (ocName ? `${ocName} Trust Account` : ""),
  );
  const [bsb, setBsb] = useState(initialDraft.bsb ?? "");
  const [bsbInvalid, setBsbInvalid] = useState(false);
  const [accountNumber, setAccountNumber] = useState(initialDraft.account_number ?? "");
  const [accountNumberInvalid, setAccountNumberInvalid] = useState(false);
  const [accountNameInvalid, setAccountNameInvalid] = useState(false);
  const [purpose, setPurpose] = useState<"combined" | "separate_admin_first" | "split_per_fund">(
    initialDraft.account_purpose ?? "combined",
  );
  const [macquarieConnect, setMacquarieConnect] = useState(initialDraft.macquarie_connect ?? true);
  const [pending, setPending] = useState(false);

  const detectedBank = useMemo(() => lookupBank(bsb), [bsb]);

  async function persistDraft(opts: { complete: boolean }) {
    setPending(true);
    const patch = {
      bank_name: bank,
      account_name: accountName.trim() || undefined,
      bsb: bsb || undefined,
      account_number: accountNumber || undefined,
      account_purpose: purpose,
      macquarie_connect: bank === "Macquarie Bank" ? macquarieConnect : false,
    };

    if (opts.complete) {
      // Save then immediately promote.
      const r = await saveStep(draftId, patch, 5);
      if (r.error) {
        setPending(false);
        toast.error(r.error);
        return;
      }
      const result = await completeWizard(draftId);
      setPending(false);
      if (result.error || !result.ocCode) {
        toast.error(result.error ?? "Failed to create the OC");
        return;
      }
      onComplete(result.ocCode);
    } else {
      // Skip path — persist trust placeholder so user can come back later.
      const r = await saveStep(draftId, patch, 5);
      setPending(false);
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.info("Saved. You can complete trust account details from the OC's bank account page.");
    }
  }

  function onContinue() {
    const problems: string[] = [];
    const bsbDigits = bsb.replace(/\D/g, "");
    const bsbOk = bsbDigits.length === 6;
    const accNumOk = /^\d{6,9}$/.test(accountNumber.replace(/\D/g, ""));
    const accNameOk = accountName.trim().length >= 2;
    if (!accNameOk) problems.push("Account name is required");
    if (!bsbOk) problems.push("BSB must be 6 digits");
    if (!accNumOk) problems.push("Account number must be 6–9 digits");
    setAccountNameInvalid(!accNameOk);
    setBsbInvalid(!bsbOk);
    setAccountNumberInvalid(!accNumOk);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }
    void persistDraft({ complete: true });
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Set up the trust account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This is the OC&apos;s bank account — separate from your management company&apos;s operating account.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="bank">
            Bank <span className="text-destructive">*</span>
          </Label>
          <select
            id="bank"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {BANKS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}{b.recommended ? " — Recommended (direct integration available)" : ""}
              </option>
            ))}
          </select>
        </div>

        {bank === "Macquarie Bank" && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <ExternalLink className="mt-0.5 h-4 w-4 text-green-700 shrink-0" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-green-900">
                  Auto-reconcile via Macquarie Connect
                </p>
                <p className="text-xs text-green-800">
                  You&apos;ll be prompted to authorise read-only API access after setup — this enables daily
                  transaction sync and auto-reconciliation against levy notices.
                </p>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="macq-connect"
                    checked={macquarieConnect}
                    onCheckedChange={(v) => setMacquarieConnect(v === true)}
                  />
                  <Label htmlFor="macq-connect" className="text-xs font-normal cursor-pointer text-green-900">
                    Set up Macquarie Connect after creating this OC
                  </Label>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="account-name">
            Account name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="account-name"
            placeholder={ocName ? `${ocName} Trust Account` : "Owners Corporation PS… Trust Account"}
            value={accountName}
            onChange={(e) => {
              setAccountName(e.target.value);
              if (accountNameInvalid) setAccountNameInvalid(false);
            }}
            aria-invalid={accountNameInvalid || undefined}
          />
        </div>

        <div className="grid grid-cols-[180px_1fr] gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bsb">
              BSB <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bsb"
              placeholder="XXX-XXX"
              value={bsb}
              onChange={(e) => {
                setBsb(formatBsb(e.target.value));
                if (bsbInvalid) setBsbInvalid(false);
              }}
              inputMode="numeric"
              maxLength={7}
              aria-invalid={bsbInvalid || undefined}
            />
            {detectedBank && <p className="text-xs text-muted-foreground">Matches {detectedBank}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-number">
              Account number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="account-number"
              placeholder="12345678"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 9));
                if (accountNumberInvalid) setAccountNumberInvalid(false);
              }}
              inputMode="numeric"
              aria-invalid={accountNumberInvalid || undefined}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Account purpose</Label>
            <span
              className="text-muted-foreground"
              title="Some OCs hold admin and maintenance funds in the same account with internal ledger separation; others use separate accounts. Both are compliant."
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { v: "combined" as const, label: "Combined admin + maintenance fund (default)" },
              { v: "separate_admin_first" as const, label: "Separate admin fund — I'll add the maintenance fund next" },
              { v: "split_per_fund" as const, label: "This OC has separate trust accounts per fund" },
            ].map((opt) => (
              <label key={opt.v} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="purpose"
                  checked={purpose === opt.v}
                  onChange={() => setPurpose(opt.v)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onBack}>Back</Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void persistDraft({ complete: false })}
            disabled={pending}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 cursor-pointer"
          >
            Skip — I&apos;ll add this later
          </button>
          <Button type="button" onClick={onContinue} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Create OC
          </Button>
        </div>
      </div>
    </div>
  );
}
