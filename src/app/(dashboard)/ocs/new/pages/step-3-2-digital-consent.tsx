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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStep, type DraftJson, type DraftLot } from "../actions";

// Wizard Step 3.2 — Lot owner digital consent.
//
// Captures TWO per-lot states:
//   1. Current digital consent — what the owner has already agreed to (e.g.
//      under previous management). source='manager_initial' at completeWizard
//      time; the owner's later portal-signup tick overwrites with their IP +
//      user-agent.
//   2. At portal signup — categories the manager wants the owner asked to
//      consent to when they first sign into the portal. Per-lot (replaces the
//      OC-wide consent_categories_offered column).

export const CATEGORIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "meetings", label: "Meeting notices and minutes", hint: "AGMs, special meetings, committee meetings." },
  { value: "levies", label: "Levy notices", hint: "Quarterly/annual levies and arrears reminders." },
  { value: "breach", label: "Breach notices", hint: "Notices about rule breaches — legally significant." },
  { value: "financial_reports", label: "Financial reports", hint: "Annual financial statements and budgets." },
  { value: "general_correspondence", label: "General correspondence", hint: "Routine updates and notifications." },
];
const ALL_CATEGORY_VALUES = CATEGORIES.map((c) => c.value);

type BulkChoice = "all" | "specific" | "none" | "";

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

  // Per-lot edit dialog. Tracks which lot's open + which column (current vs
  // signup) so the same dialog component handles both edits.
  const [editLotIdx, setEditLotIdx] = useState<number | null>(null);
  const [editColumn, setEditColumn] = useState<"current" | "signup">("current");
  const [editDraft, setEditDraft] = useState<string[]>([]);

  function applyBulk() {
    if (!bulkChoice) {
      toast.error("Pick a default first.");
      return;
    }
    if (bulkChoice === "all") {
      setLots((prev) => prev.map((l) => ({ ...l, digital_consent_categories: [...ALL_CATEGORY_VALUES] })));
    } else if (bulkChoice === "none") {
      setLots((prev) => prev.map((l) => ({ ...l, digital_consent_categories: [], at_portal_signup_categories: [...ALL_CATEGORY_VALUES] })));
    } else if (bulkChoice === "specific") {
      setLots((prev) => prev.map((l) => ({ ...l, digital_consent_categories: [...bulkSpecific] })));
    }
    toast.success(`Applied to ${lots.length} lot${lots.length === 1 ? "" : "s"}`);
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
    // If the manager just turned on digital consent for a lot without email,
    // surface a warning rather than silently storing a useless preference.
    if (editColumn === "current" && editDraft.length > 0) {
      const lot = lots[editLotIdx];
      if (!(lot?.owner_email ?? "").trim()) {
        toast.warning(`Lot ${lot?.lot_number}: no email on file — add one on Step 3.1 so they can receive digital notices.`);
      }
    }
    setEditLotIdx(null);
  }

  async function onContinue() {
    setPending(true);
    const r = await saveStep(draftId, { lots }, 4, 0); // Advance to Step 4 (Banking).
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

      {/* Bulk-set panel. Three radio options + Apply button. The Specific
          option opens a small dialog to pick categories. */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <Label className="text-sm font-semibold text-foreground">Set default for all lots…</Label>
        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="bulk-choice"
              value="all"
              checked={bulkChoice === "all"}
              onChange={() => setBulkChoice("all")}
              className="mt-1"
            />
            <span className="text-sm text-foreground">All have consented to all categories</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="bulk-choice"
              value="specific"
              checked={bulkChoice === "specific"}
              onChange={() => setBulkChoice("specific")}
              className="mt-1"
            />
            <span className="text-sm text-foreground inline-flex items-center gap-2">
              All have consented to specific categories…
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setBulkSpecificDialogOpen(true); setBulkChoice("specific"); }}
                className="text-xs underline text-primary cursor-pointer"
              >
                pick
              </button>
              <span className="text-xs text-muted-foreground">({bulkSpecific.length} of {CATEGORIES.length})</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="bulk-choice"
              value="none"
              checked={bulkChoice === "none"}
              onChange={() => setBulkChoice("none")}
              className="mt-1"
            />
            <span className="text-sm text-foreground">None have consented — ask all at signup</span>
          </label>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" size="sm" onClick={applyBulk}>
            Apply to all {lots.length} lots
          </Button>
        </div>
      </div>

      {/* Per-lot table. Two consent columns — both open the same dialog. */}
      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-xs uppercase tracking-wide border-b border-border">
              <th className="px-3 py-2 text-left font-medium w-24">Lot</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium w-56">Current digital consent</th>
              <th className="px-3 py-2 text-left font-medium w-56">At portal signup</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, idx) => {
              const current = lot.digital_consent_categories ?? [];
              const signup = lot.at_portal_signup_categories ?? [...ALL_CATEGORY_VALUES];
              return (
                <tr key={idx} className="hover:bg-muted/30">
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

      <div className="flex justify-between pt-2">
        <Button type="button" variant="secondary" onClick={onBack}>Back</Button>
        <Button type="button" onClick={onContinue} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Continue
        </Button>
      </div>

      {/* Per-lot edit dialog. Used by BOTH columns; the title flexes on
          editColumn. Master toggle + per-category checkboxes + audit note. */}
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

      {/* Bulk-specific pick dialog. */}
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
                onCheckedChange={(v) => setBulkSpecific(v === true ? [...ALL_CATEGORY_VALUES] : [])}
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
                      setBulkSpecific((prev) =>
                        prev.includes(c.value) ? prev.filter((x) => x !== c.value) : [...prev, c.value],
                      )
                    }
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
