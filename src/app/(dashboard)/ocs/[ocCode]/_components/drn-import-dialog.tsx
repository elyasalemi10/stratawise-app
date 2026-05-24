"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileText, Loader2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { previewDrnCsv, commitDrnMappings } from "@/lib/actions/macquarie-ingest";

// Macquarie DEFT Reference Number CSV import.
// Two-stage flow:
//   1. Upload CSV → previewDrnCsv → render the auto-match table with rows
//      grouped by confidence (exact, fuzzy, unmatched).
//   2. Manager resolves any "unmatched" rows by picking a lot, then clicks
//      Confirm → commitDrnMappings writes time-bounded lot_drns rows.

type Stage = "upload" | "preview" | "saving" | "done" | "failed";

type Preview = {
  matches: Array<{
    drnRow: { rowNumber: number; drn: string; primaryId: string | null; secondaryId: string | null };
    lotId: string | null;
    matchedBy: "secondary_id_lot_number" | "secondary_id_unit_number" | "primary_id_owner_name" | null;
    confidence: "exact" | "fuzzy" | "none";
    note?: string;
    lotLabel?: string;
  }>;
  totals: { total: number; matchedExact: number; matchedFuzzy: number; unmatched: number };
};

interface Props {
  open: boolean;
  onClose: () => void;
  ocId: string;
  ocCode: string;
  lots: Array<{ id: string; lot_number: number; unit_number: string | null }>;
}

export function DrnImportDialog({ open, onClose, ocId, ocCode, lots }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("upload");
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});  // rowNumber → lot_id user picked
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  function reset() {
    setStage("upload");
    setFilename(null);
    setPreview(null);
    setOverrides({});
    setError(null);
    setIsDragging(false);
    dragDepthRef.current = 0;
  }

  function closeAndReset() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("CSV exceeds 5MB.");
      return;
    }
    setFilename(file.name);
    setStage("saving");
    setError(null);

    const fd = new FormData();
    fd.append("file", file);
    const r = await previewDrnCsv(ocId, fd);
    if (r.error || !r.preview) {
      setStage("failed");
      setError(r.error ?? "Couldn't parse the CSV.");
      return;
    }
    setPreview(r.preview);
    // Seed overrides with auto-matched lot ids so manual picks just update them.
    const seed: Record<number, string> = {};
    for (const m of r.preview.matches) {
      if (m.lotId) seed[m.drnRow.rowNumber] = m.lotId;
    }
    setOverrides(seed);
    setStage("preview");
  }

  async function onConfirm() {
    if (!preview) return;
    const assignments = preview.matches
      .map((m) => {
        const lotId = overrides[m.drnRow.rowNumber] ?? m.lotId;
        if (!lotId) return null;
        return {
          drn: m.drnRow.drn,
          lot_id: lotId,
          primary_id: m.drnRow.primaryId,
          secondary_id: m.drnRow.secondaryId,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    if (assignments.length === 0) {
      toast.error("Pick a lot for at least one DRN before confirming.");
      return;
    }
    setStage("saving");
    const r = await commitDrnMappings(ocId, assignments);
    if (r.error) {
      setStage("preview");
      toast.error(r.error);
      return;
    }
    toast.success(`${r.inserted ?? assignments.length} DRN mappings saved.`);
    setStage("done");
    router.refresh();
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeAndReset(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import DEFT Reference Numbers</DialogTitle>
        </DialogHeader>

        {stage === "upload" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Export the DRN list from Macquarie Business Online (DEFT → Reports →
              Reference Number Export). Drop the CSV here and we&apos;ll auto-match
              each DRN to a lot.
            </p>
            <div
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className={`rounded-lg border-2 border-dashed transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"
              }`}
            >
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 px-6 py-10">
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
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? "Drop the CSV here" : "Click to browse or drag the DRN CSV here"}
                </p>
              </label>
            </div>
          </div>
        )}

        {stage === "saving" && filename && (
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{filename}</p>
                <p className="mt-1 text-xs text-muted-foreground">Parsing & matching…</p>
              </div>
            </div>
          </div>
        )}

        {stage === "failed" && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-900">{error}</p>
            </div>
          </div>
        )}

        {stage === "preview" && preview && (
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
                    const currentLot = overrides[m.drnRow.rowNumber] ?? m.lotId ?? "";
                    const conf = m.confidence;
                    return (
                      <tr key={m.drnRow.rowNumber} className="border-t border-border">
                        <td className="px-3 py-1.5 tabular-nums text-xs">{m.drnRow.rowNumber}</td>
                        <td className="px-3 py-1.5 tabular-nums">{m.drnRow.drn}</td>
                        <td className="px-3 py-1.5">{m.drnRow.primaryId ?? ","}</td>
                        <td className="px-3 py-1.5">{m.drnRow.secondaryId ?? ","}</td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={currentLot || undefined}
                            onValueChange={(v) => setOverrides((prev) => ({ ...prev, [m.drnRow.rowNumber]: v ?? "" }))}
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
                                <SelectItem key={l.id} value={l.id}>
                                  Lot {l.lot_number}{l.unit_number ? ` (${l.unit_number})` : ""}
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

        {stage === "done" && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
              <p className="text-sm text-green-900">
                DRN mappings saved. Incoming Macquarie transactions will now
                auto-attribute to lots via DEFT.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === "preview" && (
            <>
              <Button variant="ghost" onClick={closeAndReset}>Cancel</Button>
              <Button onClick={onConfirm}>Confirm and save</Button>
            </>
          )}
          {stage === "failed" && (
            <>
              <Button variant="ghost" onClick={closeAndReset}>Close</Button>
              <Button onClick={() => setStage("upload")}>Try a different file</Button>
            </>
          )}
          {stage === "done" && (
            <Button onClick={() => router.push(`/ocs/${ocCode}`)}>Go to OC</Button>
          )}
          {stage === "upload" && (
            <Button variant="ghost" onClick={closeAndReset}>I&apos;ll do this later</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
