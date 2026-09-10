"use client";

import { useState, useEffect, useTransition } from "react";
import { Loader2, Trash2, CalendarClock, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList,
} from "@/components/ui/combobox";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { DatePicker } from "@/components/shared/date-picker";
import {
  upsertLevyAutosendSchedule,
  updateAutosendOverrides,
  deleteLevyAutosendSchedule,
  getBudgetPlannedPeriods,
  type LevyAutosendSchedule,
  type PreviewPeriod,
} from "@/lib/actions/levy-autosend";
import { ordinalRunLabel } from "@/lib/levy-autosend-helpers";
import { formatDateLong } from "@/lib/utils";

// The levy schedule, on the page whose rows it produces.
//
// It used to live at Settings > Automation, in a table with exactly one row
// and a generic label, three clicks from anywhere. But this is not a
// setting: it is the decision about when levy notices go out and from which
// budget, which is the most consequential recurring thing an Owners
// Corporation does, and the list of batches on this page is precisely the
// record of it having happened. Cause directly above effect.
//
// The editor below is lifted from that settings tab unchanged in behaviour.

export interface LevyScheduleData {
  schedule: LevyAutosendSchedule;
  billingCycle: string;
  fyStartMonth: number;
  mailboxOptions: Array<{ value: string; label: string }>;
  budgets: Array<{ id: string; label: string }>;
  preloadedPeriods: Record<string, PreviewPeriod[]>;
}

/**
 * One line above the batch list: when the next run is, or that there is no
 * schedule at all.
 *
 * Deliberately a line and not a card. A card would make it a second thing on
 * the page competing with the list; a line reads as a caption on the list,
 * which is what it is.
 */
export function LevyScheduleStrip({
  ocId,
  data,
  onSaved,
}: {
  ocId: string;
  data: LevyScheduleData;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { schedule } = data;
  const on = schedule.enabled && !!schedule.next_send_date;
  const budgetLabel = data.budgets.find((b) => b.id === schedule.budget_id)?.label;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <CalendarClock
            className={
              on
                ? "h-4 w-4 shrink-0 text-[color:var(--brand-gold)]"
                : "h-4 w-4 shrink-0 text-muted-foreground"
            }
          />
          <div className="min-w-0">
            {schedule.last_error ? (
              <p className="text-sm font-medium text-destructive">
                The last scheduled run did not go out
              </p>
            ) : on ? (
              <p className="text-sm text-foreground">
                Next run{" "}
                <span className="font-semibold">
                  {formatDateLong(schedule.next_send_date!)}
                </span>
                {budgetLabel && (
                  <span className="text-muted-foreground"> from {budgetLabel}</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Levies are not on a schedule. Every run is a manual one.
              </p>
            )}
            {schedule.last_error && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {schedule.last_error}
              </p>
            )}
          </div>
        </div>
        <Button variant={on ? "secondary" : "default"} size="sm" onClick={() => setOpen(true)}>
          {on ? (
            <>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit schedule
            </>
          ) : (
            <>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Schedule levies
            </>
          )}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Levy schedule</SheetTitle>
            <SheetDescription className="sr-only">
              Choose the budget, the day of the month and the mailbox these go out from.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <AutoSendCard
              ocId={ocId}
              billingCycle={data.billingCycle}
              fyStartMonth={data.fyStartMonth}
              initial={schedule}
              mailboxOptions={data.mailboxOptions}
              budgets={data.budgets}
              preloadedPeriods={data.preloadedPeriods}
              embedded
              onClose={() => {
                setOpen(false);
                onSaved();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * The runs that have not happened yet, above the batches that have.
 *
 * The schedule already computes these; they were only ever visible inside
 * the editor, so the case that actually bites, a run landing on a date the
 * manager does not want, was two clicks away from being noticed. Here the
 * page reads as one timeline: what went out, and what is queued.
 */
export function QueuedRuns({ schedule }: { schedule: LevyAutosendSchedule }) {
  if (!schedule.enabled) return null;
  const pending = schedule.planned_periods.filter((p) => p.status === "pending");
  if (pending.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-md border border-dashed border-border bg-muted/30">
      {pending.slice(0, 4).map((p, i) => (
        <div
          key={p.monthKey}
          className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
        >
          <span className="text-sm text-muted-foreground">
            {ordinalRunLabel(i)} run, {formatDateLong(p.plannedDate)}
          </span>
          <Badge variant="neutral">Scheduled</Badge>
        </div>
      ))}
    </div>
  );
}

function AutoSendCard({
  ocId,
  billingCycle,
  fyStartMonth,
  initial,
  mailboxOptions,
  budgets,
  preloadedPeriods,
  embedded = false,
  onClose,
}: {
  ocId: string;
  billingCycle: string;
  fyStartMonth: number;
  initial: LevyAutosendSchedule;
  mailboxOptions: Array<{ value: string; label: string }>;
  budgets: Array<{ id: string; label: string }>;
  /** Server-pre-loaded period maps so the schedule step renders
   *  without a network round-trip when the cache hits. */
  preloadedPeriods?: Record<string, PreviewPeriod[]>;
  /** When true, render the form's contents directly , no surrounding
   *  Card or duplicate header , so it sits cleanly inside the
   *  Automations side drawer. */
  embedded?: boolean;
  /** Drawer close handler. Called after a successful save so the
   *  parent can dismiss the sheet. */
  onClose?: () => void;
}) {
  // Captured once. "Has this period already passed?" is a day-level
  // question, and a clock read during render can answer it differently
  // for two renders of the same list.
  const [nowMs] = useState(() => Date.now());
  // Day-of-month input holds a STRING so the manager can clear the
  // field while typing without us forcing 1 back in. The "Last day of
  // month" toggle short-circuits the number; when on we save 31 which
  // the cron clamps to the actual last day per month.
  // Active toggle removed , an automation either exists (saved row =
  // enabled) or it's deleted. draft.enabled is hardcoded true at save
  // time so the cron picks it up. To turn it OFF the manager hits
  // "Delete automation".
  // Mailbox default: prefer the connected Gmail mailbox over
  // the StrataWise alias when both are present. mailboxOptions is
  // already ordered "connected first" by the server, so [0] is the
  // right default for new schedules.
  const [draft, setDraft] = useState({
    budget_id: initial.budget_id ?? "",
    send_day_of_month: String(initial.send_day_of_month === 31 ? "" : initial.send_day_of_month),
    last_day_of_month: initial.send_day_of_month === 31,
    from_address: initial.from_address ?? mailboxOptions[0]?.value ?? "",
  });
  const [dayInvalid, setDayInvalid] = useState(false);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(initial.last_sent_on);

  const [overrides, setOverrides] = useState<Record<string, string>>(initial.date_overrides ?? {});

  const cycleLabel: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Every 3 months",
    half_yearly: "Every 6 months",
    annually: "Yearly",
  };

  /** Validate the form values. Returns the resolved day-of-month (1..31)
   *  on success, or null when invalid , in which case dayInvalid is set
   *  and a toast is shown. */
  function validateForm(): number | null {
    let resolvedDay: number | null = null;
    if (draft.last_day_of_month) {
      resolvedDay = 31;
    } else {
      const parsed = parseInt(draft.send_day_of_month, 10);
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 28) {
        resolvedDay = parsed;
      }
    }
    if (resolvedDay === null) {
      setDayInvalid(true);
      toast.error("Pick a day between 1 and 28, or turn on 'Last day of month'.");
      return null;
    }
    setDayInvalid(false);
    return resolvedDay;
  }

  function save() {
    const resolvedDay = validateForm();
    if (resolvedDay === null) return;

    startTransition(async () => {
      const res = await upsertLevyAutosendSchedule(ocId, {
        enabled: true,
        budget_id: draft.budget_id || null,
        send_day_of_month: resolvedDay,
        from_address: draft.from_address || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (Object.keys(overrides).length > 0) {
        const ovRes = await updateAutosendOverrides(ocId, overrides);
        if (ovRes.error) {
          toast.error(ovRes.error);
          return;
        }
      }
      toast.success("Levy schedule saved");
      setSavedAt(res.schedule?.last_sent_on ?? null);
      // The next run date is read off the page's own data, which onClose
      // refetches, rather than mirrored here: two copies of when the next
      // run is could disagree, and the one on the page is the one anyone
      // actually reads.
      onClose?.();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteLevyAutosendSchedule(ocId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Automation deleted");
      onClose?.();
    });
  }

  // Schedule preview reads the resolved day (1..28 or 31 for "last day").
  // Falls back to 1 while the manager is mid-edit so the popup always
  // has something to render without crashing.
  const previewDay = draft.last_day_of_month
    ? 31
    : (parseInt(draft.send_day_of_month, 10) || 1);

  // Server-resolved budget periods: the full FY period set for the selected
  // budget, with the ones that already have a batch marked done. Refreshed
  // whenever the budget OR the send day changes, since the day clamps
  // differently per month and the planned date shifts with it.
  //
  // One piece of state, three derived values. It used to be three pieces
  // kept in step by writing all of them from inside the effect, including on
  // the "no budget picked" path, which is a render pass spent copying what
  // the props already said. Deriving them means the cached periods paint on
  // the first frame and the only thing the effect does is hand back what the
  // server returned.
  const [fetched, setFetched] = useState<{
    budgetId: string;
    periods: PreviewPeriod[];
    doneCount: number;
  } | null>(() => {
    const id = initial.budget_id;
    const pre = id ? preloadedPeriods?.[id] : undefined;
    return id && pre
      ? { budgetId: id, periods: pre, doneCount: pre.filter((p) => p.done).length }
      : null;
  });

  useEffect(() => {
    const budgetId = draft.budget_id;
    if (!budgetId) return;
    let cancelled = false;
    getBudgetPlannedPeriods(ocId, budgetId, previewDay).then((res) => {
      if (cancelled) return;
      setFetched({ budgetId, periods: res.periods, doneCount: res.doneCount });
    });
    return () => { cancelled = true; };
  }, [draft.budget_id, ocId, previewDay]);

  const cachedForDraft = draft.budget_id ? preloadedPeriods?.[draft.budget_id] : undefined;
  const isFresh = !!draft.budget_id && fetched?.budgetId === draft.budget_id;
  const budgetPeriods: PreviewPeriod[] = !draft.budget_id
    ? []
    : isFresh
      ? fetched!.periods
      : (cachedForDraft ?? []);
  const doneCount = !draft.budget_id
    ? 0
    : isFresh
      ? fetched!.doneCount
      : (cachedForDraft?.filter((p) => p.done).length ?? 0);
  /** Drives a shimmer on the schedule step, so the manager never sees "no
   *  periods" before the fetch resolves. */
  const periodsLoading = !!draft.budget_id && !isFresh && !cachedForDraft;

  // Only the pending periods need a date picker , done ones are
  // skipped by the cron, no point showing them.
  const planned = budgetPeriods
    .filter((p) => !p.done)
    .map((p) => ({
      monthKey: p.monthKey,
      defaultDate: p.plannedDate,
      effectiveDate: overrides[p.monthKey] ?? p.plannedDate,
      isOverridden: overrides[p.monthKey] && overrides[p.monthKey] !== p.plannedDate ? true : false,
    }));
  // suppress unused-var noise from removed-but-imported FY helpers
  void fyStartMonth;

  // ── Two-step flow when embedded ─────────────────────────────
  // Step "form": all the inputs + Next button.
  // Step "schedule": planned-runs preview + Confirm/Back buttons.
  // Outside the drawer (standalone card) we skip the multi-step UX
  // and use the old single-page form.
  // For EXISTING automations the schedule sits inline on the same
  // page as the form , no Next button, no second step. For NEW
  // automations we still use the two-step flow so the manager
  // confirms the schedule before saving.
  const isExisting = !!initial.id;
  const [embeddedStep, setEmbeddedStep] = useState<"form" | "schedule">(
    isExisting ? "schedule" : "form",
  );
  // When editing, render BOTH sections at once. We reuse the
  // "schedule" branch's rendering by treating the form as always-on
  // and showing schedule inline below it.
  const showFormSection = embeddedStep === "form" || isExisting;
  const showScheduleSection = embeddedStep === "schedule" || isExisting;

  // Body of the card. Single vertical column so it fits the narrow
  // drawer without anything being cramped.
  const body = (
    <div className={embedded ? "space-y-4" : ""}>
      {showFormSection && (
        <>
          {/* Budget picker , LOCKED on existing automations. Changing
              the budget mid-flight would invalidate the planned
              periods + cron history, so we only allow it at creation
              time. Same applies to day-of-month: the schedule is
              already in flight against this day. Manager who wants to
              switch budgets deletes + recreates. */}
          <div className="space-y-1.5">
            <Label>Budget</Label>
            {isExisting ? (
              <div className="h-9 rounded-md border border-border bg-cool-muted px-3 flex items-center text-sm text-cool-muted-foreground">
                {budgets.find((b) => b.id === draft.budget_id)?.label ?? "(none)"}
              </div>
            ) : (
              <Combobox
                items={budgets}
                value={draft.budget_id}
                onValueChange={(v) => setDraft((p) => ({ ...p, budget_id: v ?? "" }))}
              >
                <ComboboxInput placeholder="Pick a budget" />
                <ComboboxContent>
                  <ComboboxEmpty>No approved budgets.</ComboboxEmpty>
                  <ComboboxList>
                    {(b: { id: string; label: string }) => (
                      <ComboboxItem key={b.id} value={b.id} keywords={[b.label]}>
                        {b.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Send mailbox</Label>
            <Select
              value={draft.from_address}
              onValueChange={(v) => setDraft((p) => ({ ...p, from_address: v ?? "" }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a mailbox">
                  {mailboxOptions.find((o) => o.value === draft.from_address)?.label ?? null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {mailboxOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Day of month</Label>
            {isExisting ? (
              <div className="h-9 rounded-md border border-border bg-cool-muted px-3 flex items-center text-sm text-cool-muted-foreground">
                {draft.last_day_of_month ? "Last day of month" : draft.send_day_of_month || "(none)"}
              </div>
            ) : (
              <>
                <NumberInput
                  value={draft.send_day_of_month}
                  onChange={(v) => {
                    setDraft((p) => ({ ...p, send_day_of_month: v, last_day_of_month: false }));
                    setDayInvalid(false);
                  }}
                  allowDecimal={false}
                  disabled={draft.last_day_of_month}
                  invalid={dayInvalid}
                  placeholder="1-28"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={draft.last_day_of_month}
                    onCheckedChange={(v) => {
                      const checked = v === true;
                      setDraft((p) => ({ ...p, last_day_of_month: checked, send_day_of_month: checked ? "" : p.send_day_of_month }));
                      setDayInvalid(false);
                }}
              />
                  <span>Last day of month</span>
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <div className="h-10 rounded-md border border-border bg-cool-muted px-3 flex items-center text-sm text-cool-muted-foreground">
              {cycleLabel[billingCycle] ?? billingCycle}
            </div>
          </div>
        </>
      )}

      {showScheduleSection && (
        <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
          {periodsLoading ? (
            // Skeleton shimmer , 3 stacked rows that look like the
            // real First/Second/Third run blocks. No reflow when the
            // server resolves.
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          ) : planned.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
              Every period for this budget has already been generated. Pick a different budget, or delete the automation.
            </div>
          ) : (
            <>
              {doneCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {doneCount} period{doneCount === 1 ? "" : "s"} already generated for this budget , skipped. The dates below cover what&apos;s left.
                </p>
              )}
              {planned.map((p, idx) => {
                const [yy, mm] = p.monthKey.split("-");
                const firstOfMonth = `${p.monthKey}-01`;
                const lastDay = new Date(Date.UTC(Number(yy), Number(mm), 0)).getUTCDate();
                const lastOfMonth = `${p.monthKey}-${lastDay.toString().padStart(2, "0")}`;
                // A quarter is "in the past" when its month-end is
                // before today's date. The cron either fired it
                // already or skipped it; either way changing the
                // date now would be a no-op, so disable.
                const periodEndMs = new Date(`${lastOfMonth}T23:59:59Z`).getTime();
                const isPast = periodEndMs < nowMs;
                return (
                  <div key={p.monthKey} className="space-y-1.5">
                    <Label className={isPast ? "text-muted-foreground" : undefined}>
                      {ordinalRunLabel(idx)}
                      {isPast && <span className="ml-2 text-[10px] tracking-normal">past</span>}
                    </Label>
                    <DatePicker
                      value={p.effectiveDate}
                      onChange={(v) => {
                        setOverrides((o) => {
                          const next = { ...o };
                          if (v === p.defaultDate) delete next[p.monthKey];
                          else next[p.monthKey] = v;
                          return next;
                        });
                      }}
                      minDate={firstOfMonth}
                      maxDate={lastOfMonth}
                      disabled={isPast}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

        {/* Next-run line only shows on the standalone (non-embedded)
            card. Inside the drawer the schedule step already lays out
            every run date, so repeating "Next run" up top is noise. */}
        {!embedded && savedAt && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Last sent: <span className="font-medium text-foreground">{savedAt}</span>
          </div>
        )}

      <div className="flex justify-between gap-2 pt-2">
        {/* Delete is destructive-styled (red) and only shown when
            editing an existing automation. New automations have
            nothing to delete yet. */}
        <div>
          {embedded && isExisting && (
            <Button
              variant="secondary"
              onClick={handleDelete}
              disabled={pending}
              className="!text-destructive hover:!bg-destructive/10"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete automation
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {embedded && isExisting && (
            <Button onClick={save} disabled={pending} loading={pending}>
              Save changes
            </Button>
          )}
          {embedded && !isExisting && embeddedStep === "form" && (
            <Button
              onClick={() => {
                if (validateForm() === null) return;
                setEmbeddedStep("schedule");
              }}
              disabled={pending}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              Next
            </Button>
          )}
          {embedded && !isExisting && embeddedStep === "schedule" && (
            <>
              <Button variant="secondary" onClick={() => setEmbeddedStep("form")} disabled={pending}>
                Back
              </Button>
              {planned.length > 0 && (
                <Button onClick={save} disabled={pending} loading={pending}>
                  Confirm
                </Button>
              )}
            </>
          )}
          {!embedded && (
            <Button onClick={save} disabled={pending} loading={pending}>
              Save auto-send
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return embedded ? body : (
    <Card>
      <CardContent className="pt-5">{body}</CardContent>
    </Card>
  );
}
