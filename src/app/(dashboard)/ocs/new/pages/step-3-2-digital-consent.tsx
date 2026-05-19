"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveStep, type DraftJson, type DraftLot } from "../actions";
import { WizardActions } from "./_components/wizard-actions";

// Wizard Step 3 sub-step 2 — Lot owner digital consent.

export const CATEGORIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "meetings", label: "Meeting notices and minutes", hint: "AGMs, special meetings, committee meetings." },
  { value: "levies", label: "Levy notices", hint: "Quarterly/annual levies and arrears reminders." },
  { value: "breach", label: "Breach notices", hint: "Notices about rule breaches — legally significant." },
  { value: "financial_reports", label: "Financial reports", hint: "Annual financial statements and budgets." },
  { value: "general_correspondence", label: "General correspondence", hint: "Routine updates and notifications." },
];
const ALL_CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

type BulkChoice = "" | "all" | "specific" | "none";

export function Step3DigitalConsent({
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
  const [lots, setLots] = useState<DraftLot[]>(initialDraft.lots ?? []);
  const [bulkChoice, setBulkChoice] = useState<BulkChoice>("");
  const [bulkSpecific, setBulkSpecific] = useState<string[]>(ALL_CATEGORY_VALUES);
  const [bulkSpecificDialogOpen, setBulkSpecificDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const [editLotIdx, setEditLotIdx] = useState<number | null>(null);
  const [editColumn, setEditColumn] = useState<"current" | "signup">("current");
  const [editDraft, setEditDraft] = useState<string[]>([]);

  // Bulk-set is auto-applied: picking a radio rewrites every lot's state
  // immediately. Both columns (current consent + at-portal-signup) get the
  // bulk pick written explicitly so that opening the per-lot edit dialog
  // reflects the bulk action instead of falling back to "all ticked".
  // Per-lot edits override the bulk for that specific lot only.
  function pickBulk(choice: BulkChoice) {
    setBulkChoice(choice);
    if (choice === "all") {
      setLots((prev) => prev.map((l) => ({
        ...l,
        digital_consent_categories: [...ALL_CATEGORY_VALUES],
        at_portal_signup_categories: [...ALL_CATEGORY_VALUES],
      })));
    } else if (choice === "none") {
      setLots((prev) => prev.map((l) => ({
        ...l,
        digital_consent_categories: [],
        at_portal_signup_categories: [...ALL_CATEGORY_VALUES],
      })));
    } else if (choice === "specific") {
      setLots((prev) => prev.map((l) => ({
        ...l,
        digital_consent_categories: [...bulkSpecific],
        at_portal_signup_categories: [...bulkSpecific],
      })));
    }
  }

  // When the manager edits the "specific categories" set, re-apply if the
  // bulk choice was "specific" (so the table reflects the new selection
  // without an extra Apply click).
  function applySpecificEdit(next: string[]) {
    setBulkSpecific(next);
    if (bulkChoice === "specific") {
      setLots((prev) => prev.map((l) => ({
        ...l,
        digital_consent_categories: [...next],
        at_portal_signup_categories: [...next],
      })));
    }
  }

  function openEdit(lotIdx: number, column: "current" | "signup") {
    setEditLotIdx(lotIdx);
    setEditColumn(column);
    const lot = lots[lotIdx];
    setEditDraft(
      column === "current"
        ? (lot?.digital_consent_categories ?? [])
        : (lot?.at_portal_signup_categories ?? [...ALL_CATEGORY_VALUES]),
    );
  }
  function commitEdit() {
    if (editLotIdx == null) return;
    setLots((prev) => prev.map((l, i) => {
      if (i !== editLotIdx) return l;
      if (editColumn === "current") return { ...l, digital_consent_categories: editDraft };
      return { ...l, at_portal_signup_categories: editDraft };
    }));
    setEditLotIdx(null);
  }

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, { lots }, 4, 0); // Advance to Step 4 (Banking). Comms default moved to Settings.
    if (r.error) {
      setPending(false);
      toast.error(r.error);
      return;
    }
    await onNext();
  }

  function summariseCategories(cats: string[] | undefined): string {
    if (!cats || cats.length === 0) return "— none —";
    if (cats.length === CATEGORIES.length) return "All categories";
    return `${cats.length} of ${CATEGORIES.length}`;
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Lot owner digital consent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Record any digital communication consent each lot owner has already given. The owner will be prompted to confirm or update these preferences when they first sign into the portal.
        </p>
      </div>

      {/* Bulk-set. Radio-style choices that auto-apply on click — no Apply
          button. "Specific" reveals a dedicated "Pick consented items"
          button BELOW the radio group instead of squeezing the link inside
          the radio row, so it's discoverable when the option is selected. */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <Label className="text-sm font-semibold text-foreground">Set default for all lots</Label>
        <div className="space-y-2">
          {([
            { value: "all" as const, label: "All have consented to all categories" },
            { value: "specific" as const, label: `All have consented to specific categories (${bulkSpecific.length} of ${CATEGORIES.length})` },
            { value: "none" as const, label: "None have consented — ask all at signup" },
          ]).map((opt) => {
            const selected = bulkChoice === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickBulk(opt.value)}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm cursor-pointer transition-colors ${
                  selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-primary" : "border-border"
                  }`}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="text-sm text-foreground flex-1">{opt.label}</span>
              </button>
            );
          })}
        </div>
        {bulkChoice === "specific" && (
          <div className="pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setBulkSpecificDialogOpen(true)}
            >
              <Pencil className="size-3.5" />
              Pick consented items
            </Button>
          </div>
        )}
      </div>

      {/* Per-lot table. Alternating row colours (#25); normal-case headers
          (#32); no row dividers. */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-primary text-primary-foreground">
            <tr className="text-xs font-medium">
              <th className="px-3 py-2 text-left w-24">Lot</th>
              <th className="px-3 py-2 text-left">Owner</th>
              <th className="px-3 py-2 text-left w-56">Current digital consent</th>
              <th className="px-3 py-2 text-left w-56">At portal signup</th>
            </tr>
          </thead>
          <tbody className="[&_tr:nth-child(odd)]:bg-card [&_tr:nth-child(even)]:bg-muted/20">
            {lots.map((lot, idx) => {
              const current = lot.digital_consent_categories ?? [];
              const signup = lot.at_portal_signup_categories ?? [...ALL_CATEGORY_VALUES];
              return (
                <tr key={idx}>
                  <td className="px-3 py-2 tabular-nums">
                    {lot.lot_number}
                    {lot.unit_number ? <span className="text-muted-foreground"> / {lot.unit_number}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate" title={lot.owner_name || ""}>
                    {lot.owner_name || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground">{summariseCategories(current)}</span>
                      <button
                        type="button"
                        onClick={() => openEdit(idx, "current")}
                        aria-label="Edit current digital consent"
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-foreground">{summariseCategories(signup)}</span>
                      <button
                        type="button"
                        onClick={() => openEdit(idx, "signup")}
                        aria-label="Edit at-portal-signup categories"
                        className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <WizardActions
        draftId={draftId}
        onBack={onBack}
        onContinue={onContinue}
        continuePending={pending}
        getCurrentPatch={() => ({ lots })}
      />

      {/* Per-lot edit dialog. Checkboxes carry bg-card so they read against
          the popup's white surface. */}
      <Dialog open={editLotIdx != null} onOpenChange={(o) => { if (!o) setEditLotIdx(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editColumn === "current" ? "Digital consent" : "At portal signup"}
              {editLotIdx != null && lots[editLotIdx] && (
                <> — {lots[editLotIdx]?.owner_name || "Owner"} (Lot {lots[editLotIdx]?.lot_number})</>
              )}
            </DialogTitle>
            <DialogDescription>
              {editColumn === "current"
                ? "Categories this owner has consented to receive by email."
                : "Categories the owner will be asked to consent to when they first sign into the portal."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <Checkbox
                checked={editDraft.length === CATEGORIES.length}
                onCheckedChange={(v) => setEditDraft(v === true ? [...ALL_CATEGORY_VALUES] : [])}
                className="bg-card"
              />
              <Label className="text-sm font-medium text-foreground">Master toggle — all categories</Label>
            </div>
            {CATEGORIES.map((c) => {
              const checked = editDraft.includes(c.value);
              return (
                <div key={c.value} className="flex items-start gap-2 px-1">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      setEditDraft((prev) =>
                        prev.includes(c.value) ? prev.filter((x) => x !== c.value) : [...prev, c.value],
                      )
                    }
                    className="bg-card"
                  />
                  <div className="-mt-0.5">
                    <Label className="text-sm text-foreground">{c.label}</Label>
                    <p className="text-xs text-muted-foreground">{c.hint}</p>
                  </div>
                </div>
              );
            })}
            <div className="rounded-md border border-border bg-muted/20 p-3 mt-2 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                {editColumn === "current"
                  ? "Source: Manager-recorded at OC setup. The owner will be asked to confirm or update these at portal signup, where their tick is recorded with IP and timestamp for audit."
                  : "These categories appear on the owner's first portal sign-in. Their tick is recorded with IP + timestamp for audit."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditLotIdx(null)}>Cancel</Button>
            <Button onClick={commitEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk-specific pick dialog. Re-applies live to all lots when the
          bulk-choice was "specific". */}
      <Dialog open={bulkSpecificDialogOpen} onOpenChange={setBulkSpecificDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pick categories</DialogTitle>
            <DialogDescription>These categories will be marked as already consented for every lot.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <Checkbox
                checked={bulkSpecific.length === CATEGORIES.length}
                onCheckedChange={(v) => applySpecificEdit(v === true ? [...ALL_CATEGORY_VALUES] : [])}
                className="bg-card"
              />
              <Label className="text-sm font-medium text-foreground">All categories</Label>
            </div>
            {CATEGORIES.map((c) => {
              const checked = bulkSpecific.includes(c.value);
              return (
                <div key={c.value} className="flex items-start gap-2 px-1">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      applySpecificEdit(
                        bulkSpecific.includes(c.value)
                          ? bulkSpecific.filter((x) => x !== c.value)
                          : [...bulkSpecific, c.value],
                      )
                    }
                    className="bg-card"
                  />
                  <div className="-mt-0.5">
                    <Label className="text-sm text-foreground">{c.label}</Label>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBulkSpecificDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
