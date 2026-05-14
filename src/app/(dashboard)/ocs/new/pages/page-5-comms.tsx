"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, MailOpen, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { saveStep, type DraftJson, type DraftLot } from "../actions";

// Wizard page 5 — Communications & consent.
//
// What this page captures:
//   1. OC-wide default delivery method (postal / email / mixed). Drives
//      where new notices go when an individual lot owner hasn't expressed
//      a preference.
//   2. Whether to ask each lot owner for digital-comms consent during
//      portal signup. If yes, the manager picks which categories to ask
//      consent for.
//   3. For each lot owner the manager already has email + paper-trail
//      consent from (under previous management), which categories that
//      owner has already consented to. Recorded here so day-one notices
//      can go digital instead of paper.
//
// What this page does NOT do — by design:
//   - It doesn't record IP / user-agent / timestamp. Those only matter for
//     consent the OWNER themselves provides; what the manager attests to
//     here is recorded with source='manager_initial' and no IP. The portal
//     signup flow later writes the IP + UA + signup-time consent on top.
//   - It doesn't send any notices. It just configures policy + initial
//     state. Future levy / minutes / breach notice flows read the per-lot
//     `digital_consent_categories` to decide channel.

const ALL_CATEGORIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "levies", label: "Levy notices", hint: "Quarterly / annual levy invoices and arrears reminders." },
  { value: "agms", label: "AGMs & special meetings", hint: "Meeting notices, agendas, and post-meeting minutes." },
  { value: "minutes", label: "Committee minutes", hint: "Minutes of committee meetings between AGMs." },
  { value: "breach_notices", label: "Breach notices", hint: "Notices about rule breaches — legally significant; many lot owners want these on paper regardless." },
  { value: "financials", label: "Financial statements", hint: "Annual financial reports and budgets." },
];

export function Page5Comms({
  draftId,
  initialDraft,
  onBack,
  onNext,
}: {
  draftId: string;
  initialDraft: DraftJson;
  onBack: () => void;
  onNext: () => void;
}) {
  const [defaultDelivery, setDefaultDelivery] = useState<"postal" | "email" | "mixed">(
    initialDraft.default_delivery_method ?? "postal",
  );
  const [collectOnSignup, setCollectOnSignup] = useState<boolean>(
    initialDraft.collect_consent_on_signup ?? true,
  );
  const [offeredCategories, setOfferedCategories] = useState<string[]>(
    initialDraft.consent_categories_offered ?? ["levies", "agms", "minutes", "breach_notices", "financials"],
  );

  // Per-lot consent state — initialised from existing draft so a resumed
  // wizard preserves whatever the manager last entered.
  const [lots, setLots] = useState<DraftLot[]>(initialDraft.lots ?? []);
  const [pending, setPending] = useState(false);

  function toggleOffered(category: string) {
    setOfferedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  function toggleLotConsent(lotIdx: number, category: string) {
    setLots((prev) =>
      prev.map((l, i) => {
        if (i !== lotIdx) return l;
        const current = l.digital_consent_categories ?? [];
        const next = current.includes(category)
          ? current.filter((c) => c !== category)
          : [...current, category];
        return { ...l, digital_consent_categories: next };
      }),
    );
  }

  function bulkToggleAll(category: string, on: boolean) {
    setLots((prev) =>
      prev.map((l) => {
        const current = l.digital_consent_categories ?? [];
        if (on && !current.includes(category)) {
          return { ...l, digital_consent_categories: [...current, category] };
        }
        if (!on && current.includes(category)) {
          return { ...l, digital_consent_categories: current.filter((c) => c !== category) };
        }
        return l;
      }),
    );
  }

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, {
      default_delivery_method: defaultDelivery,
      collect_consent_on_signup: collectOnSignup,
      consent_categories_offered: offeredCategories,
      lots,
    }, 6);
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  // Surface only the lots that have an owner email so the consent column
  // is meaningful — there's no point asking the manager to tick "Levies"
  // for an owner with no email address on file. Lots without email always
  // default to postal regardless of OC policy.
  const lotsWithEmail = lots.filter((l) => (l.owner_email ?? "").trim());
  const lotsWithoutEmail = lots.filter((l) => !(l.owner_email ?? "").trim());

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Communications & consent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How this OC sends notices, and what each lot owner has already consented to receive digitally.
        </p>
      </div>

      {/* OC-wide default delivery method. Three explicit tiles rather than
          a Select so the trade-off (email faster + cheaper vs postal more
          legally bulletproof for breach notices) is visible up front. */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Default delivery method</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {([
            { value: "postal" as const, icon: MailX, title: "Postal only", body: "Every notice goes by Australia Post. Safest legal default but slow and adds delivery costs per notice." },
            { value: "mixed" as const, icon: Mail, title: "Mixed (recommended)", body: "Email if the lot owner has consented to that category, postal otherwise. Most OCs end up here." },
            { value: "email" as const, icon: MailOpen, title: "Email by default", body: "Owners get digital notices unless they explicitly opt out. Only use if every owner has consented." },
          ] as const).map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDefaultDelivery(opt.value)}
                className={`text-left rounded-md border p-4 transition-colors cursor-pointer ${
                  defaultDelivery === opt.value ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <h4 className="text-sm font-semibold text-foreground">{opt.title}</h4>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{opt.body}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Signup-flow consent. Manager toggles whether the portal asks lot
          owners for consent when they first sign in; if on, the manager
          picks which categories to ask about. Each box's label hint appears
          inline so the manager can decide what's reasonable to ask. */}
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Checkbox
            id="collect-on-signup"
            checked={collectOnSignup}
            onCheckedChange={(v) => setCollectOnSignup(v === true)}
          />
          <div className="-mt-0.5">
            <Label className="text-sm font-semibold text-foreground">
              Ask each lot owner for digital-comms consent during portal signup
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When the lot owner first signs in we&apos;ll show them a checkbox listing the
              categories below. Their tick is recorded with their IP + timestamp so it
              holds up if a notice is ever disputed.
            </p>
          </div>
        </div>
        {collectOnSignup && (
          <div className="ml-6 space-y-2 rounded-md border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-foreground">Ask consent for:</p>
            {ALL_CATEGORIES.map((c) => {
              const checked = offeredCategories.includes(c.value);
              return (
                <div key={c.value} className="flex items-start gap-2">
                  <Checkbox
                    id={`offered-${c.value}`}
                    checked={checked}
                    onCheckedChange={() => toggleOffered(c.value)}
                  />
                  <div className="-mt-0.5">
                    <Label className="text-sm font-medium text-foreground">{c.label}</Label>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-lot existing consent. Manager attests to what each owner has
          consented to under previous management. Owners without an email
          are shown read-only below so the manager knows why they can't
          flip them. */}
      {lotsWithEmail.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Existing consent — owners with email on file</h3>
            <p className="text-xs text-muted-foreground">
              Tick what each owner has already consented to receive digitally. Recorded as
              manager-attested (no IP) — when they sign up via the portal, their own
              tick replaces this with a full audit trail.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium w-44 sticky left-0 bg-muted/40">Lot / Owner</th>
                  {ALL_CATEGORIES.map((c) => (
                    <th key={c.value} className="px-2 py-2 text-center font-medium">
                      <div className="flex flex-col items-center gap-1">
                        <span>{c.label}</span>
                        {/* Bulk toggles let the manager flip a whole column
                            in one click — useful when the previous manager
                            had a uniform policy. */}
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => bulkToggleAll(c.value, true)}
                            className="rounded px-1 text-[10px] text-primary hover:underline cursor-pointer"
                          >
                            all
                          </button>
                          <span className="text-muted-foreground">/</span>
                          <button
                            type="button"
                            onClick={() => bulkToggleAll(c.value, false)}
                            className="rounded px-1 text-[10px] text-muted-foreground hover:underline cursor-pointer"
                          >
                            none
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lotsWithEmail.map((lot) => {
                  const lotIdx = lots.findIndex((l) => l.lot_number === lot.lot_number);
                  const consent = lot.digital_consent_categories ?? [];
                  return (
                    <tr key={lot.lot_number} className="border-t border-border">
                      <td className="px-3 py-2 sticky left-0 bg-card">
                        <p className="font-medium text-foreground">Lot {lot.lot_number}{lot.unit_number ? ` / ${lot.unit_number}` : ""}</p>
                        <p className="text-muted-foreground truncate">{lot.owner_name || "—"}</p>
                      </td>
                      {ALL_CATEGORIES.map((c) => (
                        <td key={c.value} className="px-2 py-2 text-center">
                          <Checkbox
                            id={`lot-${lot.lot_number}-${c.value}`}
                            checked={consent.includes(c.value)}
                            onCheckedChange={() => toggleLotConsent(lotIdx, c.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lotsWithoutEmail.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{lotsWithoutEmail.length}</strong>{" "}
            lot{lotsWithoutEmail.length === 1 ? "" : "s"} have no owner email on file and will receive paper notices by default. Add their email in step 4 if they should be eligible for digital comms.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
