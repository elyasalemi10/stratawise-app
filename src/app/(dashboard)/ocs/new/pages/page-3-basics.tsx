"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { saveStep, type DraftJson } from "../actions";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function tierForLotCount(n: number, servicesOnly: boolean): number {
  if (servicesOnly) return 5;
  if (n >= 100) return 1;
  if (n >= 51) return 2;
  if (n >= 10) return 3;
  if (n >= 3) return 4;
  return 5;
}

function tierColour(t: number): string {
  switch (t) {
    case 1: return "bg-red-100 text-red-900 border-red-300";
    case 2: return "bg-orange-100 text-orange-900 border-orange-300";
    case 3: return "bg-amber-100 text-amber-900 border-amber-300";
    case 4: return "bg-green-100 text-green-900 border-green-300";
    default: return "bg-blue-100 text-blue-900 border-blue-300";
  }
}

export function Page3Basics({
  draftId,
  initialDraft,
  totalLots,
  onNext,
  onBack,
}: {
  draftId: string;
  initialDraft: DraftJson;
  totalLots: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const [tradingName, setTradingName] = useState(initialDraft.trading_name ?? "");
  const [servicesOnly, setServicesOnly] = useState(initialDraft.services_only ?? false);
  const [fyMonth, setFyMonth] = useState<number>(initialDraft.financial_year_start_month ?? 7);
  const [sameNotice, setSameNotice] = useState(initialDraft.notice_address_same_as_oc ?? true);
  const [noticeAddress, setNoticeAddress] = useState(initialDraft.notice_address ?? "");
  const [commonSeal, setCommonSeal] = useState(initialDraft.common_seal ?? false);
  const [sealText, setSealText] = useState(initialDraft.common_seal_text ?? "");
  const [pending, setPending] = useState(false);

  const tier = useMemo(() => tierForLotCount(totalLots, servicesOnly), [totalLots, servicesOnly]);

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, {
      trading_name: tradingName || undefined,
      services_only: servicesOnly,
      financial_year_start_month: fyMonth,
      notice_address_same_as_oc: sameNotice,
      notice_address: sameNotice ? undefined : noticeAddress,
      common_seal: commonSeal,
      common_seal_text: commonSeal ? sealText : undefined,
    }, 4);
    setPending(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    onNext();
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Tell us about this OC</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A few details that don&apos;t appear on the plan of subdivision.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="trading-name">
            Trading name <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="trading-name"
            placeholder="The Grandview Apartments"
            value={tradingName}
            onChange={(e) => setTradingName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Some OCs use a friendly name alongside their legal name.
          </p>
        </div>

        {/* Tier display + services-only override */}
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Tier</span>
                <span
                  className="text-muted-foreground"
                  title="OC tier determines compliance requirements like audit obligations, maintenance plans, and committee size under the Owners Corporations Act 2006."
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Auto-calculated from lot count ({totalLots} lots).
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${tierColour(tier)}`}>
              Tier {tier}
            </span>
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-border pt-3">
            <Checkbox
              id="services-only"
              checked={servicesOnly}
              onCheckedChange={(v) => setServicesOnly(v === true)}
            />
            <Label htmlFor="services-only" className="text-sm font-normal cursor-pointer">
              This is a services-only OC (no lots in a shared building) — force Tier 5
            </Label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fy-month">Financial year start</Label>
          <select
            id="fy-month"
            value={fyMonth}
            onChange={(e) => setFyMonth(parseInt(e.target.value, 10))}
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>1 {m}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Most Victorian OCs use 1 July to align with the financial year.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="same-notice"
              checked={sameNotice}
              onCheckedChange={(v) => setSameNotice(v === true)}
            />
            <Label htmlFor="same-notice" className="text-sm font-normal cursor-pointer">
              Address for service of notices is the same as the OC address
            </Label>
          </div>
          {!sameNotice && (
            <Input
              placeholder="Address for service of notices"
              value={noticeAddress}
              onChange={(e) => setNoticeAddress(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="common-seal"
              checked={commonSeal}
              onCheckedChange={(v) => setCommonSeal(v === true)}
            />
            <Label htmlFor="common-seal" className="text-sm font-normal cursor-pointer">
              This OC has a common seal
            </Label>
            <span
              className="text-muted-foreground"
              title="Common seals are required on some legal documents. If unsure, leave unchecked — you can add it later."
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>
          {commonSeal && (
            <Input
              placeholder="Seal description / custodian"
              value={sealText}
              onChange={(e) => setSealText(e.target.value)}
            />
          )}
        </div>
      </div>

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
