"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileText, Info, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import {
  clearDraftDrnMappings,
  previewDraftDrnCsv,
  saveDraftDrnMappings,
  type WizardDrnPreview,
} from "../../actions";

interface DraftLotLite {
  lot_number: number;
  unit_number: string | null;
  owner_name: string | null;
}

interface Props {
  draftId: string;
  initialMappings: Array<{
    drn: string;
    lot_number: number;
    primary_id: string | null;
    secondary_id: string | null;
  }>;
  lots: DraftLotLite[];
}

type Stage = "idle" | "uploading" | "preview" | "saved" | "failed";

// Macquarie DRN CSV import surface for the wizard. Lives on Page 5 (Bank
// accounts) once the manager picks Macquarie as the admin-fund bank. Mirrors
// the post-creation flow but stages the rows on draft_json.lot_drns rather
// than the lot_drns table , lots don't have IDs yet. completeWizard does the
// final lot_id resolution + insert.
//
// "Skip for now" is permitted: a Macquarie OC can still be created without
// the DRN mapping. Until uploaded, incoming transactions just won't
// auto-attribute by DRN; the existing fallbacks (BPAY CRN, reference number,
// fuzzy payer name) still run.
export function DraftDrnPanel({ draftId, initialMappings, lots }: Props) {
  const [stage, setStage] = useState<Stage>(initialMappings.length > 0 ? "saved" : "idle");
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<WizardDrnPreview | null>(null);
  const [overrides, setOverrides] = useState<Record<number, number>>({}); // rowNumber → lot_number
  const [savedCount, setSavedCount] = useState(initialMappings.length);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dragDepthRef = useRef(0);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("CSV exceeds 5MB.");
      return;
    }
    setFilename(file.name);
    setStage("uploading");
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await previewDraftDrnCsv(draftId, fd);
    if (r.error || !r.preview) {
      setStage("failed");
      setError(r.error ?? "Couldn't read the CSV.");
      return;
    }
    setPreview(r.preview);
    // Seed overrides with auto-matched lot numbers; manual picks just update them.
    const seed: Record<number, number> = {};
    for (const m of r.preview.matches) {
      if (m.lot_number != null) seed[m.rowNumber] = m.lot_number;
    }
    setOverrides(seed);
    setStage("preview");
  }

  async function onConfirm() {
    if (!preview) return;
    const assignments = preview.matches
      .map((m) => {
        const lot_number = overrides[m.rowNumber] ?? m.lot_number ?? null;
        if (lot_number == null) return null;
        return {
          drn: m.drn,
          lot_number,
          primary_id: m.primaryId,
          secondary_id: m.secondaryId,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
    if (assignments.length === 0) {
      toast.error("Pick a lot for at least one DRN before saving.");
      return;
    }
    setStage("uploading");
    const r = await saveDraftDrnMappings(draftId, assignments);
    if (r.error) {
      setStage("preview");
      toast.error(r.error);
      return;
    }
    setSavedCount(assignments.length);
    setStage("saved");
    setPreview(null);
    setFilename(null);
    toast.success(`${assignments.length} DRN mapping${assignments.length === 1 ? "" : "s"} saved to this OC.`);
  }

  async function onRemoveAll() {
    setRemoving(true);
    const r = await clearDraftDrnMappings(draftId);
    setRemoving(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setSavedCount(0);
    setStage("idle");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }
  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }
  function onDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 text-primary shrink-0" />
        <div className="text-xs text-muted-foreground">
          Macquarie&apos;s DEFT system tags every incoming transaction with the
          payer&apos;s <strong className="text-foreground">DEFT Reference Number</strong>.
          Upload the DRN export CSV from Macquarie Business Online now and we&apos;ll
          auto-match each DRN to a lot. You can also skip and add it later.
        </div>
      </div>

      {stage === "saved" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-green-200 bg-green-50 p-3">
          <div className="flex items-center gap-2 text-sm text-green-900">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <span>
              {savedCount} DRN mapping{savedCount === 1 ? "" : "s"} ready. They&apos;ll be saved
              when you create this OC.
            </span>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onRemoveAll} disabled={removing}>
            {removing && <Loader2 className="size-3.5 animate-spin" />}
            <Trash2 className="size-3.5" />
            Remove
          </Button>
        </div>
      )}

      {stage === "idle" && (
        <div
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`rounded-lg border-2 border-dashed transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-border bg-card"
          }`}
        >
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 px-6 py-6">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {isDragging ? "Drop the CSV here" : "Upload your DRN CSV"}
            </p>
            <p className="text-xs text-muted-foreground">
              From Macquarie Business Online → DEFT → Reports → Reference Number Export.
            </p>
          </label>
        </div>
      )}

      {stage === "uploading" && filename && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground truncate">{filename}</span>
          <span className="text-xs text-muted-foreground">Reading…</span>
        </div>
      )}

      {stage === "failed" && (
        <div className="space-y-2">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setStage("idle")}>
            Try a different file
          </Button>
        </div>
      )}

      <Dialog open={stage === "preview"} onOpenChange={(open) => { if (!open) setStage("idle"); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirm DRN mappings</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-xs">
                <Stat label="Total" value={preview.totals.total} />
                <Stat label="Auto (exact)" value={preview.totals.matchedExact} className="text-green-700" />
                <Stat label="Auto (fuzzy)" value={preview.totals.matchedFuzzy} className="text-amber-700" />
                <Stat label="Unmatched" value={preview.totals.unmatched} className="text-destructive" />
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                    <tr className="text-xs uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-medium">Row</th>
                      <th className="px-3 py-2 text-left font-medium">DRN</th>
                      <th className="px-3 py-2 text-left font-medium">Primary ID</th>
                      <th className="px-3 py-2 text-left font-medium">Secondary ID</th>
                      <th className="px-3 py-2 text-left font-medium">Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matches.map((m) => {
                      const current = overrides[m.rowNumber] ?? m.lot_number ?? null;
                      const conf = m.confidence;
                      return (
                        <tr key={m.rowNumber}>
                          <td className="px-3 py-1.5 tabular-nums text-xs">{m.rowNumber}</td>
                          <td className="px-3 py-1.5 tabular-nums">{m.drn}</td>
                          <td className="px-3 py-1.5">{m.primaryId ?? ","}</td>
                          <td className="px-3 py-1.5">{m.secondaryId ?? ","}</td>
                          <td className="px-3 py-1.5">
                            <Select
                              value={current != null ? String(current) : undefined}
                              onValueChange={(v) => setOverrides((prev) => ({
                                ...prev,
                                [m.rowNumber]: parseInt(v ?? "0", 10) || 0,
                              }))}
                            >
                              <SelectTrigger
                                size="sm"
                                className={
                                  conf === "exact" ? "border-green-300" :
                                  conf === "fuzzy" ? "border-amber-300" :
                                  "border-destructive/50"
                                }
                              >
                                <SelectValue placeholder=", pick a lot ," />
                              </SelectTrigger>
                              <SelectContent>
                                {lots.map((l) => (
                                  <SelectItem key={l.lot_number} value={String(l.lot_number)}>
                                    Lot {l.lot_number}
                                    {l.unit_number ? ` (${l.unit_number})` : ""}
                                    {l.owner_name ? ` , ${l.owner_name}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {m.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{m.note}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStage("idle")}>Cancel</Button>
            <Button onClick={onConfirm}>Save mappings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${className ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
