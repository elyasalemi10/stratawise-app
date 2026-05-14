"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Mail, MailOpen, MailX, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NumberInput } from "@/components/ui/number-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  // Postal transit buffers (string so empty-while-typing is allowed). Each
  // bucket gets its own value; floor + parse happen at Continue time.
  const [meetingsBuffer, setMeetingsBuffer] = useState<string>(
    String(initialDraft.meetings_postal_buffer_days ?? 14),
  );
  const [leviesBuffer, setLeviesBuffer] = useState<string>(
    String(initialDraft.levies_postal_buffer_days ?? 14),
  );
  const [financialBuffer, setFinancialBuffer] = useState<string>(
    String(initialDraft.financial_postal_buffer_days ?? 14),
  );
  const [bufferInvalid, setBufferInvalid] = useState<{ meetings: boolean; levies: boolean; financial: boolean }>({ meetings: false, levies: false, financial: false });
  const [pending, setPending] = useState(false);
  // 5.1 sub-view — the buffer screen. Lives within step 5 (no progress-bar
  // bump). After the main Comms config screen, Continue moves to "buffer"
  // if postal is in play; otherwise we save + advance straight to step 6.
  const [phase, setPhase] = useState<"main" | "buffer">("main");

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

  // Per-lot popup state. Holds the lot index being edited; null = closed.
  // Local draft inside the popup so the manager can preview category
  // toggles before confirming — Save persists; Cancel discards.
  const [popupLotIdx, setPopupLotIdx] = useState<number | null>(null);
  const [popupDraft, setPopupDraft] = useState<string[]>([]);
  function openPerLotPopup(lotIdx: number) {
    setPopupLotIdx(lotIdx);
    setPopupDraft(lots[lotIdx]?.digital_consent_categories ?? []);
  }
  function commitPerLotPopup() {
    if (popupLotIdx == null) return;
    setLots((prev) => prev.map((l, i) => i === popupLotIdx ? { ...l, digital_consent_categories: popupDraft } : l));
    setPopupLotIdx(null);
  }
  const popupAllOn = popupDraft.length === ALL_CATEGORIES.length;
  function popupToggleAll(on: boolean) {
    setPopupDraft(on ? ALL_CATEGORIES.map((c) => c.value) : []);
  }
  function popupToggleCategory(cat: string) {
    setPopupDraft((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  }

  // Phase 1 Continue → buffer sub-view ALWAYS, even when the current
  // comms config is pure email. The buffer config is per-OC and lasts
  // beyond this wizard; if the manager (or a future owner via the
  // portal) ever flips someone back to postal we want the buffer
  // already configured. Pre-filled defaults (14 days) match the
  // statutory-minimum-plus-comfortable-margin everyone uses, so a
  // manager who doesn't currently send postal can just Continue
  // through without thinking about it.
  async function onMainContinue() {
    setPhase("buffer");
  }

  // Phase 2 Continue: 5.1 buffer screen → validate + save + advance.
  async function onBufferContinue() {
    const parseBuffer = (s: string): number | null => {
      const n = parseInt(s, 10);
      if (!Number.isFinite(n) || n < 7) return null;
      return n;
    };
    const problems: string[] = [];
    const flags = { meetings: false, levies: false, financial: false };
    let meetingsN = 14, leviesN = 14, financialN = 14;
    const m = parseBuffer(meetingsBuffer);
    const l = parseBuffer(leviesBuffer);
    const f = parseBuffer(financialBuffer);
    if (m === null) { problems.push("Meetings buffer must be 7 days or more."); flags.meetings = true; }
    else meetingsN = m;
    if (l === null) { problems.push("Levies buffer must be 7 days or more."); flags.levies = true; }
    else leviesN = l;
    if (f === null) { problems.push("Financial documents buffer must be 7 days or more."); flags.financial = true; }
    else financialN = f;
    setBufferInvalid(flags);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted buffer fields.");
      return;
    }
    await persist({ meetings: meetingsN, levies: leviesN, financial: financialN });
  }

  async function persist(buffers: { meetings: number; levies: number; financial: number }) {
    setPending(true);
    const r = await saveStep(draftId, {
      default_delivery_method: defaultDelivery,
      collect_consent_on_signup: collectOnSignup,
      consent_categories_offered: offeredCategories,
      meetings_postal_buffer_days: buffers.meetings,
      levies_postal_buffer_days: buffers.levies,
      financial_postal_buffer_days: buffers.financial,
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
        <h2 className="text-lg font-semibold text-foreground">
          {phase === "main" ? "Communications & consent" : "Postal transit buffer"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {phase === "main"
            ? "How this OC sends notices, and what each lot owner has already consented to receive digitally."
            : "Extra days added on top of the statutory minimum so postal notices reach owners in time."}
        </p>
      </div>
      {/* phase=main: full Comms configuration. phase=buffer: a sub-view
          (informally "5.1") that's shown only when at least one notice
          will travel by post. NOT a separate step number — the progress
          bar stays on 5 throughout. */}
      {phase === "main" && (
      <>{/* MAIN PHASE start */}

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
          consented to under previous management. Each row is independent
          and gets its own All / None bulk toggle. Owners without an email
          are listed read-only at the bottom so the manager understands
          why those rows are absent. */}
      {lotsWithEmail.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-1 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Existing consent — owners with email on file</h3>
              <p className="text-xs text-muted-foreground">
                Tick each category an owner has already consented to receive digitally.
                Per-row <strong>All</strong> / <strong>None</strong> flips that row; per-column flips the whole column.
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label="How this is recorded" className="mt-0.5 text-muted-foreground hover:text-foreground cursor-help">
                      <Info className="h-4 w-4" />
                    </button>
                  }
                />
                <TooltipContent>
                  <span>Recorded with source=<code>manager_initial</code> and no IP. When the lot owner signs up via the portal, their own tick replaces this row with a full IP + user-agent audit trail.</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-xs uppercase tracking-wide border-b border-border">
                  <th className="px-3 py-2 text-left font-medium">Lot / Owner</th>
                  <th className="px-3 py-2 text-left font-medium w-48">Digital consent</th>
                  <th className="px-3 py-2 text-left font-medium w-32">Categories</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {lotsWithEmail.map((lot) => {
                  const lotIdx = lots.findIndex((l) => l.lot_number === lot.lot_number);
                  const consent = lot.digital_consent_categories ?? [];
                  const isDigital = consent.length > 0;
                  const allCats = consent.length === ALL_CATEGORIES.length;
                  const summary = allCats
                    ? "All categories"
                    : consent.length === 0
                      ? "—"
                      : `${consent.length} of ${ALL_CATEGORIES.length}`;
                  return (
                    <tr key={lot.lot_number} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">
                          Lot {lot.lot_number}{lot.unit_number ? ` / ${lot.unit_number}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground truncate" title={lot.owner_name || ""}>
                          {lot.owner_name || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {/* Single Yes/No pill control — matches the
                            Debit/Credit pattern from the balances page.
                            Clicking "Yes" with empty consent pre-fills
                            with all categories (the common case), so the
                            manager doesn't have to open the popup for
                            uniform consents. */}
                        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (!isDigital) {
                                setLots((prev) => prev.map((l, i) => i === lotIdx ? { ...l, digital_consent_categories: ALL_CATEGORIES.map((c) => c.value) } : l));
                              }
                            }}
                            className={`px-3 py-0.5 text-xs rounded-sm cursor-pointer ${isDigital ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (isDigital) {
                                setLots((prev) => prev.map((l, i) => i === lotIdx ? { ...l, digital_consent_categories: [] } : l));
                              }
                            }}
                            className={`px-3 py-0.5 text-xs rounded-sm cursor-pointer ${!isDigital ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                          >
                            No
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {summary}
                      </td>
                      <td className="px-2 py-2">
                        {/* Edit pencil — only meaningful when consent is on.
                            Disabled state stays visually present so the
                            row doesn't reflow when consent flips on/off
                            (CLAUDE.md hover-icon-stability rule). */}
                        <button
                          type="button"
                          onClick={() => openPerLotPopup(lotIdx)}
                          disabled={!isDigital}
                          aria-label="Edit categories"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-default cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
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
        <Button type="button" onClick={onMainContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>
      </>)}{/* MAIN PHASE end */}

      {/* 5.1 buffer sub-view. Same step indicator (no progress-bar bump);
          Back returns to the main Comms config so the manager can edit
          their consent state if the buffer screen reminds them of an
          owner they forgot. */}
      {phase === "buffer" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Send date = event date − (statutory minimum + buffer).</strong>
                {" "}Floor 7 days, default 14, no upper limit. Only applies when at least one lot owner receives that notice by post.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {([
                { key: "meetings" as const, label: "Meetings (committee, general, AGM)", value: meetingsBuffer, setter: setMeetingsBuffer, statutory: "7d committee, 14d general/AGM" },
                { key: "levies" as const, label: "Levy notices", value: leviesBuffer, setter: setLeviesBuffer, statutory: "28d" },
                { key: "financial" as const, label: "Financial documents", value: financialBuffer, setter: setFinancialBuffer, statutory: "—" },
              ]).map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <Label htmlFor={`buf-${row.key}`} className="text-xs font-medium text-foreground">{row.label}</Label>
                  <div className="relative">
                    <NumberInput
                      id={`buf-${row.key}`}
                      allowDecimal={false}
                      value={row.value}
                      onChange={(v) => {
                        row.setter(v);
                        if (bufferInvalid[row.key]) setBufferInvalid((b) => ({ ...b, [row.key]: false }));
                      }}
                      invalid={bufferInvalid[row.key]}
                      placeholder="Days"
                      className="pr-12"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Statutory min: {row.statutory}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button type="button" variant="secondary" onClick={() => setPhase("main")} disabled={pending}>Back</Button>
            <Button type="button" onClick={onBufferContinue} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Per-lot category popup. Opened from the Edit pencil on each
          row of the digital-consent table. Carries a master "Toggle all"
          switch + a per-category checkbox list. Save commits to the
          parent state; Cancel discards the popup-local draft. */}
      <Dialog open={popupLotIdx != null} onOpenChange={(o) => { if (!o) setPopupLotIdx(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Digital consent — Lot {popupLotIdx != null ? lots[popupLotIdx]?.lot_number : ""}
            </DialogTitle>
            <DialogDescription>
              Tick each category the owner has consented to receive digitally.
              {" "}<strong className="text-foreground">Toggle all</strong> flips them on or off in one click.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <Checkbox
                id="popup-all"
                checked={popupAllOn}
                onCheckedChange={(v) => popupToggleAll(v === true)}
              />
              <Label className="text-sm font-medium text-foreground">Toggle all</Label>
            </div>
            {ALL_CATEGORIES.map((c) => {
              const checked = popupDraft.includes(c.value);
              return (
                <div key={c.value} className="flex items-start gap-2 px-1">
                  <Checkbox
                    id={`popup-${c.value}`}
                    checked={checked}
                    onCheckedChange={() => popupToggleCategory(c.value)}
                  />
                  <div className="-mt-0.5">
                    <Label className="text-sm text-foreground">{c.label}</Label>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPopupLotIdx(null)}>Cancel</Button>
            <Button onClick={commitPerLotPopup}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
