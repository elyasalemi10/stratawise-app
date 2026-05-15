"use client";

import { useCallback, useRef, useState } from "react";
import {
  Check, FileText, Upload, AlertTriangle, Loader2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  parseSettlementForReview,
  parseSettlementAndMatchLot,
  applySettlementToLot,
  type SettlementReview,
} from "@/lib/actions/settlements";

interface PropsLotMode {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lotId: string;
  lotNumber: number;
  onApplied?: () => void;
}

interface PropsOCMode {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lotId?: undefined;
  lotNumber?: undefined;
  onApplied?: () => void;
}

type Props = PropsLotMode | PropsOCMode;

type Stage = "upload" | "parsing" | "review" | "submitting";

export function SettlementDialog(props: Props) {
  const { open, onClose, ocId, onApplied } = props;
  const knownLotId = props.lotId ?? null;
  const knownLotNumber = props.lotNumber ?? null;

  const [stage, setStage] = useState<Stage>("upload");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [review, setReview] = useState<SettlementReview | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable form state, prefilled from parsed PDF.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [settlementDate, setSettlementDate] = useState("");

  const reset = useCallback(() => {
    setStage("upload");
    setDocumentId(null);
    setReview(null);
    setDragging(false);
    setName(""); setEmail(""); setPhone(""); setPostalAddress(""); setDateOfBirth(""); setSettlementDate("");
  }, []);

  const handleClose = useCallback(() => {
    if (stage === "parsing" || stage === "submitting") return;
    reset();
    onClose();
  }, [stage, reset, onClose]);

  const startUpload = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file.");
      return;
    }
    setStage("parsing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("oc_id", ocId);
      if (knownLotId) formData.append("lot_id", knownLotId);
      formData.append("category", "settlement");

      const uploadRes = await fetch("/api/documents", { method: "POST", body: formData });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error ?? "Upload failed");
      }
      const docId: string = uploadJson.id;
      setDocumentId(docId);

      const reviewRes = knownLotId
        ? await parseSettlementForReview(docId, knownLotId)
        : await parseSettlementAndMatchLot(docId, ocId);

      if (reviewRes.error || !reviewRes.data) {
        throw new Error(reviewRes.error ?? "Could not parse PDF");
      }

      const data = reviewRes.data;
      setReview(data);
      setName(data.parsed.transferee.name ?? "");
      setEmail(data.parsed.transferee.email ?? "");
      setPhone(data.parsed.transferee.phone ?? "");
      setPostalAddress(data.parsed.transferee.postalAddress ?? "");
      setDateOfBirth(data.parsed.transferee.dateOfBirth ?? "");
      setSettlementDate(data.parsed.settlementDate ?? "");
      setStage("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process settlement", {
        duration: Infinity,
        closeButton: true,
      });
      reset();
    }
  }, [ocId, knownLotId, reset]);

  // Resolve the lot we're applying to: either the one passed in (per-lot mode)
  // or the one the parser matched (oc mode).
  const targetLotId = knownLotId ?? review?.matchedLot?.id ?? null;
  const targetLotNumber = knownLotNumber ?? review?.matchedLot?.lotNumber ?? null;

  const handleConfirm = useCallback(async () => {
    if (!documentId || !targetLotId) return;
    if (!name.trim() || !email.trim() || !settlementDate) {
      toast.error("Name, email and settlement date are required.");
      return;
    }
    setStage("submitting");
    const result = await applySettlementToLot({
      documentId,
      lotId: targetLotId,
      newOwner: {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        postalAddress: postalAddress.trim() || null,
        dateOfBirth: dateOfBirth || null,
      },
      settlementDate,
      acknowledgeMismatch: review ? !(review.matches.lotNumber !== false && review.matches.planNumber !== false) : false,
    });

    if (result.error) {
      toast.error(result.error, { duration: Infinity, closeButton: true });
      setStage("review");
      return;
    }

    toast.success("Settlement recorded", {
      description: `New owner ${name.trim()} is now pending acceptance${targetLotNumber != null ? ` for Lot ${targetLotNumber}` : ""}.`,
    });
    reset();
    onClose();
    onApplied?.();
  }, [documentId, targetLotId, name, email, phone, postalAddress, dateOfBirth, settlementDate, review, targetLotNumber, reset, onClose, onApplied]);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record settlement</DialogTitle>
        </DialogHeader>

        {stage === "upload" && (
          <UploadDropzone
            dragging={dragging}
            setDragging={setDragging}
            fileInputRef={fileInputRef}
            onFile={startUpload}
          />
        )}

        {stage === "parsing" && <ParsingSkeleton />}

        {stage === "review" && review && targetLotNumber != null && (
          <ReviewForm
            review={review}
            lotNumber={targetLotNumber}
            isMatched={!knownLotId}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            phone={phone} setPhone={setPhone}
            postalAddress={postalAddress} setPostalAddress={setPostalAddress}
            dateOfBirth={dateOfBirth} setDateOfBirth={setDateOfBirth}
            settlementDate={settlementDate} setSettlementDate={setSettlementDate}
          />
        )}

        {stage === "submitting" && <ParsingSkeleton message="Applying settlement..." />}

        {/* Cancel button removed — the dialog's built-in close (X corner +
            ESC + outside click) is enough. Confirm stays as the primary
            action when we reach the review stage. */}
        {stage === "review" && (
          <DialogFooter>
            <Button type="button" onClick={handleConfirm}>
              <Check className="h-4 w-4" />
              Confirm and assign
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload dropzone ──────────────────────────────────────────────

function UploadDropzone({
  dragging, setDragging, fileInputRef, onFile,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  // The whole dropzone is now a single click target. Click anywhere inside
  // opens the file picker — no separate "Choose file" button to aim at.
  // Keyboard accessibility: Enter / Space also open the picker.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/40"
      }`}
    >
      <Upload className="h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-medium text-foreground">
        Drop or click to upload the Notice of Acquisition PDF
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        We&apos;ll extract the new owner details and let you review before assigning.
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Parsing spinner ──────────────────────────────────────────────
//
// Mirrors the wizard's plan-of-subdivision upload step — a centred spinner
// + filename + status copy reads as "we're working on it" more clearly
// than rectangular skeletons (which suggest "structure is coming").

function ParsingSkeleton({ message = "Reading the settlement document…" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        This usually takes 10–30 seconds.
      </p>
    </div>
  );
}

// ─── Review form ──────────────────────────────────────────────────

function ReviewForm(props: {
  review: SettlementReview;
  lotNumber: number;
  isMatched: boolean;
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  postalAddress: string; setPostalAddress: (v: string) => void;
  dateOfBirth: string; setDateOfBirth: (v: string) => void;
  settlementDate: string; setSettlementDate: (v: string) => void;
}) {
  const { review, lotNumber, isMatched } = props;
  const couldNotExtract = !review.parsed.transferee.name && !review.parsed.lotNumber && !review.parsed.settlementDate;

  return (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
      {isMatched && review.matchedLot && (
        <div className="flex items-start gap-2 rounded-md border border-[hsl(160,100%,37%)]/30 bg-[hsl(160,100%,37%)]/10 px-3 py-2 text-xs text-[hsl(160,100%,30%)]">
          <Check className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Matched <span className="font-medium">Lot {review.matchedLot.lotNumber}{review.matchedLot.unitNumber ? ` (Unit ${review.matchedLot.unitNumber})` : ""}</span> in this oc based on the lot and plan numbers in the PDF.
          </span>
        </div>
      )}

      {/* Document + match summary */}
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-start gap-3">
          <FileText className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{review.documentName}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <MatchPill
                label="Lot number"
                expected={String(review.expected.lotNumber ?? lotNumber)}
                actual={review.parsed.lotNumber == null ? null : String(review.parsed.lotNumber)}
                match={review.matches.lotNumber}
              />
              <MatchPill
                label="Plan"
                expected={review.expected.planNumberNormalized ?? review.expected.planNumber ?? "—"}
                actual={review.parsed.planNumber}
                match={review.matches.planNumber}
              />
            </div>
          </div>
        </div>
      </div>

      {couldNotExtract && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            We could not extract the standard fields from this PDF (it may be a scanned image).
            Fill in the details below manually to continue, or cancel and assign the owner via the
            existing invite flow.
          </span>
        </div>
      )}

      {/* Outgoing owner banner */}
      {review.currentOwner && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outgoing owner</p>
          <p className="mt-1 text-foreground font-medium">{review.currentOwner.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{review.currentOwner.email ?? "—"}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Their access ends on the settlement date. Their payment history and communications stay
            available to them under <span className="font-medium">Past lots</span>.
          </p>
        </div>
      )}

      {review.pendingInvitationId && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            A pending invitation already exists for this lot. Confirming will revoke it and replace
            it with the new owner from this settlement.
          </span>
        </div>
      )}

      {/* New owner editable form (prefilled from PDF) */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">New owner</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="settlement-name">Name <span className="text-destructive">*</span></Label>
            <Input id="settlement-name" value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="Full legal name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settlement-email">Email <span className="text-destructive">*</span></Label>
            <Input id="settlement-email" type="email" value={props.email} onChange={(e) => props.setEmail(e.target.value)} placeholder="owner@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settlement-phone">Phone</Label>
            <Input id="settlement-phone" value={props.phone} onChange={(e) => props.setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="settlement-postal">Postal address</Label>
            <Input id="settlement-postal" value={props.postalAddress} onChange={(e) => props.setPostalAddress(e.target.value)} placeholder="For correspondence — used as absent-owner address if different from the lot" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settlement-dob">Date of birth</Label>
            <Input id="settlement-dob" type="date" value={props.dateOfBirth} onChange={(e) => props.setDateOfBirth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settlement-date">Settlement date <span className="text-destructive">*</span></Label>
            <Input id="settlement-date" type="date" value={props.settlementDate} onChange={(e) => props.setSettlementDate(e.target.value)} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          The new owner will appear as <span className="font-medium">Pending invitation</span> on this lot.
          No email is sent — share the invitation link manually when you&apos;re ready.
        </p>
      </div>

      {/* Sale info — read-only context */}
      {(review.parsed.salePriceCents != null || review.parsed.contractDate || review.parsed.conveyancer.name) && (
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <p className="font-medium uppercase tracking-wide text-muted-foreground">From the document</p>
          {review.parsed.salePriceCents != null && (
            <InfoRow label="Sale price" value={formatCents(review.parsed.salePriceCents)} />
          )}
          {review.parsed.contractDate && (
            <InfoRow label="Contract date" value={review.parsed.contractDate} />
          )}
          {review.parsed.conveyancer.name && (
            <InfoRow label="Conveyancer" value={`${review.parsed.conveyancer.name}${review.parsed.conveyancer.email ? ` · ${review.parsed.conveyancer.email}` : ""}`} />
          )}
          {review.parsed.additionalTransferees.length > 0 && (
            <InfoRow
              label="Joint owners"
              value={`${review.parsed.additionalTransferees.length} additional transferee(s) recorded — invite manually if required.`}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function MatchPill({
  label, expected, actual, match,
}: {
  label: string;
  expected: string;
  actual: string | null;
  match: boolean | null;
}) {
  if (match === null) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-muted-foreground">{label}: not in PDF</span>
      </span>
    );
  }
  if (match) {
    return (
      <span className="inline-flex items-center gap-1 text-[hsl(160,100%,30%)]">
        <Check className="h-3 w-3" />
        {label} {actual} matches
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-900">
      <X className="h-3 w-3" />
      {label} {actual} ≠ {expected}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}
