"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Upload, AlertTriangle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/shared/date-picker";
import { PlacesAutocomplete } from "@/components/shared/places-autocomplete";
import {
  parseSettlementForReview,
  parseSettlementAndMatchLot,
  applySettlementToLot,
  findLotByNumberInOc,
  type SettlementReview,
} from "@/lib/actions/settlements";

interface PropsLotMode {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lotId: string;
  lotNumber: number;
  /** Optional default postal address used to pre-fill the new owner's
   *  service address — typically "Unit X / <oc address>" of the lot
   *  currently being transferred. */
  lotAddress?: string | null;
  onApplied?: () => void;
}

interface PropsOCMode {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lotId?: undefined;
  lotNumber?: undefined;
  lotAddress?: undefined;
  onApplied?: () => void;
}

type Props = PropsLotMode | PropsOCMode;

type Stage = "upload" | "parsing" | "review" | "submitting";

// "manual" mode lets the manager skip the PDF upload entirely and type the
// new owner details by hand. The action accepts a null documentId in that
// case and skips the document-attachment checks.
type EntryMode = "pdf" | "manual";

export function SettlementDialog(props: Props) {
  const { open, onClose, ocId, onApplied } = props;
  const router = useRouter();
  const knownLotId = props.lotId ?? null;
  const knownLotNumber = props.lotNumber ?? null;
  const knownLotAddress = props.lotAddress ?? null;

  // 2-step mismatch confirmation. Step "plan" runs first (highest stakes —
  // wrong plan-of-subdivision = wrong building entirely); "lot" runs only
  // after plan is acknowledged (or matched), so the manager can either
  // confirm in place or jump to the lot the document actually mentions.
  const [mismatchStep, setMismatchStep] = useState<"plan" | "lot" | null>(null);
  const [jumpingToLot, setJumpingToLot] = useState(false);

  const [stage, setStage] = useState<Stage>("upload");
  const [entryMode, setEntryMode] = useState<EntryMode>("pdf");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [review, setReview] = useState<SettlementReview | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable form state, prefilled from parsed PDF.
  // Date of birth was removed in 2026-05 — it isn't load-bearing for
  // strata correspondence and we don't want to be the one storing it.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [settlementDate, setSettlementDate] = useState("");
  const [occupancy, setOccupancy] = useState<"owner_occupied" | "tenanted" | "vacant">("owner_occupied");
  const [tenantName, setTenantName] = useState("");
  const [tenantNameInvalid, setTenantNameInvalid] = useState(false);
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");

  const reset = useCallback(() => {
    setStage("upload");
    setEntryMode("pdf");
    setDocumentId(null);
    setReview(null);
    setDragging(false);
    setName(""); setEmail(""); setPhone(""); setPostalAddress(""); setSettlementDate("");
    setOccupancy("owner_occupied"); setTenantName(""); setTenantNameInvalid(false); setTenantEmail(""); setTenantPhone("");
  }, []);

  // Manual entry — skip the PDF stage and jump straight to the review form
  // with empty values. Pre-fill the postal address with the current lot's
  // own address (e.g. "Unit 2 / 14 Smith St, Hawthorn VIC 3122") so the
  // common case "owner lives at the lot" is one click away.
  const startManualEntry = useCallback(() => {
    setEntryMode("manual");
    setDocumentId(null);
    setReview(null);
    setName(""); setEmail(""); setPhone("");
    setPostalAddress(knownLotAddress ?? "");
    setSettlementDate("");
    setStage("review");
  }, [knownLotAddress]);

  // Re-seed the postal address whenever the drawer (re)opens onto the
  // manual path — covers the case where the manager swaps lots without
  // unmounting the SettlementDialog instance.
  useEffect(() => {
    if (open && entryMode === "manual" && knownLotAddress && !postalAddress) {
      setPostalAddress(knownLotAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entryMode, knownLotAddress]);

  // Hydrate from the "Go to lot X" sessionStorage hand-off so the new
  // lot's drawer opens with the same parsed data the user was reviewing
  // on the wrong lot. One-shot — clear after read.
  useEffect(() => {
    if (!open || !knownLotId || typeof window === "undefined") return;
    const key = `sw:settlement-prefill:${knownLotId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        documentId?: string | null;
        name?: string;
        email?: string;
        phone?: string;
        postalAddress?: string;
        settlementDate?: string;
        occupancy?: "owner_occupied" | "tenanted" | "vacant";
        tenantName?: string;
        tenantEmail?: string;
        tenantPhone?: string;
      };
      // No PDF re-parse — the existing document was already attached to
      // the OTHER lot. Drop the manager into manual mode with the form
      // pre-filled so they can finish without re-uploading.
      setEntryMode("manual");
      setDocumentId(null);
      if (payload.name) setName(payload.name);
      if (payload.email) setEmail(payload.email);
      if (payload.phone) setPhone(payload.phone);
      if (payload.postalAddress) setPostalAddress(payload.postalAddress);
      if (payload.settlementDate) setSettlementDate(payload.settlementDate);
      if (payload.occupancy) setOccupancy(payload.occupancy);
      if (payload.tenantName) setTenantName(payload.tenantName);
      if (payload.tenantEmail) setTenantEmail(payload.tenantEmail);
      if (payload.tenantPhone) setTenantPhone(payload.tenantPhone);
      setStage("review");
      toast.success("Carried your settlement details across to this lot.");
    } catch (err) {
      console.warn("settlement prefill parse failed", err);
    } finally {
      sessionStorage.removeItem(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, knownLotId]);

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

  // Local validation that runs before either the mismatch popup OR the
  // direct submit fires. Returns true if the form is ready to send.
  const validateForm = useCallback((): boolean => {
    if (!targetLotId) return false;
    if (entryMode === "pdf" && !documentId) return false;
    if (!name.trim() || !settlementDate) {
      toast.error("Name and settlement date are required.");
      return false;
    }
    if (!postalAddress.trim()) {
      toast.error("Postal address is required (used for paper notices).");
      return false;
    }
    if (occupancy === "tenanted" && !tenantName.trim()) {
      setTenantNameInvalid(true);
      toast.error("Tenant name is required when the lot is tenanted.");
      return false;
    }
    return true;
  }, [targetLotId, entryMode, documentId, name, settlementDate, postalAddress, occupancy, tenantName]);

  const submitSettlement = useCallback(async () => {
    if (!targetLotId) return;
    setStage("submitting");
    const result = await applySettlementToLot({
      documentId: entryMode === "manual" ? null : documentId,
      lotId: targetLotId,
      newOwner: {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        postalAddress: postalAddress.trim(),
        dateOfBirth: null,
        verifiedPostal: false,
      },
      settlementDate,
      occupancyStatus: occupancy,
      tenantName: occupancy === "tenanted" ? tenantName.trim() || null : null,
      tenantEmail: occupancy === "tenanted" ? tenantEmail.trim() || null : null,
      tenantPhone: occupancy === "tenanted" ? tenantPhone.trim() || null : null,
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
    setMismatchStep(null);
    onClose();
    onApplied?.();
  }, [entryMode, documentId, targetLotId, name, email, phone, postalAddress, settlementDate, occupancy, tenantName, tenantEmail, tenantPhone, review, targetLotNumber, reset, onClose, onApplied]);

  // Entry point fired by the footer's "Confirm and assign" button.
  // If the parsed PDF says a different plan or lot than the one the
  // manager is applying to, open the 2-step mismatch popup first.
  const handleConfirm = useCallback(() => {
    if (!validateForm()) return;
    if (entryMode === "pdf" && review) {
      if (review.matches.planNumber === false) {
        setMismatchStep("plan");
        return;
      }
      if (review.matches.lotNumber === false) {
        setMismatchStep("lot");
        return;
      }
    }
    void submitSettlement();
  }, [validateForm, entryMode, review, submitSettlement]);

  // "Go to lot X" branch: look up the lot the parser thinks the document
  // is for, stash the parsed data + form values in sessionStorage, then
  // navigate. The destination lot page reads that payload on mount and
  // pops the settlement drawer pre-filled.
  const handleJumpToParsedLot = useCallback(async () => {
    if (!review?.parsed.lotNumber) return;
    setJumpingToLot(true);
    const res = await findLotByNumberInOc(ocId, review.parsed.lotNumber);
    setJumpingToLot(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    // Carry the in-flight form across the navigation so the manager
    // doesn't retype anything. Keys are scoped per-lot so two tabs
    // don't collide.
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        `sw:settlement-prefill:${res.lotId}`,
        JSON.stringify({
          documentId,
          name,
          email,
          phone,
          postalAddress,
          settlementDate,
          occupancy,
          tenantName,
          tenantEmail,
          tenantPhone,
          source: "wrong-lot-jump",
        }),
      );
    }
    setMismatchStep(null);
    onClose();
    router.push(`/ocs/${res.ocShortCode}/lots/${res.lotId}?settlement=open`);
  }, [
    review,
    ocId,
    documentId,
    name,
    email,
    phone,
    postalAddress,
    settlementDate,
    occupancy,
    tenantName,
    tenantEmail,
    tenantPhone,
    onClose,
    router,
  ]);

  // ─── Render ───────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-lg p-0 gap-0 bg-card flex flex-col"
      >
        <SheetHeader className="border-b border-border bg-card px-5 pt-5 pb-4 gap-0.5">
          <SheetTitle className="text-base font-semibold text-foreground">
            Record settlement
          </SheetTitle>
          <p className="text-xs text-muted-foreground">
            Upload a Notice of Acquisition PDF or enter the owner details manually.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {stage === "upload" && (
          <div className="space-y-3">
            <UploadDropzone
              dragging={dragging}
              setDragging={setDragging}
              fileInputRef={fileInputRef}
              onFile={startUpload}
            />
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={startManualEntry}
            >
              Enter settlement details manually
            </Button>
          </div>
        )}

        {stage === "parsing" && <ParsingSkeleton />}

        {stage === "review" && entryMode === "pdf" && review && targetLotNumber != null && (
          <ReviewForm
            review={review}
            lotNumber={targetLotNumber}
            isMatched={!knownLotId}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            phone={phone} setPhone={setPhone}
            postalAddress={postalAddress} setPostalAddress={setPostalAddress}
            settlementDate={settlementDate} setSettlementDate={setSettlementDate}
            occupancy={occupancy} setOccupancy={setOccupancy}
            tenantName={tenantName} setTenantName={(v) => { setTenantName(v); if (tenantNameInvalid) setTenantNameInvalid(false); }}
            tenantNameInvalid={tenantNameInvalid}
            tenantEmail={tenantEmail} setTenantEmail={setTenantEmail}
            tenantPhone={tenantPhone} setTenantPhone={setTenantPhone}
          />
        )}

        {stage === "review" && entryMode === "manual" && (
          <ManualReviewForm
            lotNumber={knownLotNumber}
            lotAddress={knownLotAddress}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            phone={phone} setPhone={setPhone}
            postalAddress={postalAddress} setPostalAddress={setPostalAddress}
            settlementDate={settlementDate} setSettlementDate={setSettlementDate}
            occupancy={occupancy} setOccupancy={setOccupancy}
            tenantName={tenantName} setTenantName={(v) => { setTenantName(v); if (tenantNameInvalid) setTenantNameInvalid(false); }}
            tenantNameInvalid={tenantNameInvalid}
            tenantEmail={tenantEmail} setTenantEmail={setTenantEmail}
            tenantPhone={tenantPhone} setTenantPhone={setTenantPhone}
          />
        )}

        {stage === "submitting" && <ParsingSkeleton message="Applying settlement..." />}

        </div>

        {/* Sticky footer with Confirm action when on the review stage. */}
        {stage === "review" && (
          <div className="border-t border-border bg-card px-5 py-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleConfirm}>
              <Check className="h-4 w-4" />
              Confirm and assign
            </Button>
          </div>
        )}

        <Dialog
          open={mismatchStep !== null}
          onOpenChange={(o) => { if (!o) setMismatchStep(null); }}
        >
          <DialogContent className="sm:max-w-md">
            {mismatchStep === "plan" && review && (
              <>
                <DialogHeader>
                  <DialogTitle>This document is for a different plan</DialogTitle>
                  <DialogDescription>
                    The document references plan{" "}
                    <span className="font-medium text-foreground">
                      {review.parsed.planNumber ?? "—"}
                    </span>
                    , but this OC is plan{" "}
                    <span className="font-medium text-foreground">
                      {review.expected.planNumber ?? "—"}
                    </span>
                    . Are you sure this is the right document?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMismatchStep(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (review.matches.lotNumber === false) {
                        setMismatchStep("lot");
                      } else {
                        setMismatchStep(null);
                        void submitSettlement();
                      }
                    }}
                  >
                    I&apos;m sure — continue
                  </Button>
                </DialogFooter>
              </>
            )}
            {mismatchStep === "lot" && review && (
              <>
                <DialogHeader>
                  <DialogTitle>This document is for a different lot</DialogTitle>
                  <DialogDescription>
                    The document references{" "}
                    <span className="font-medium text-foreground">
                      Lot {review.parsed.lotNumber ?? "—"}
                    </span>
                    , but you&apos;re applying it to{" "}
                    <span className="font-medium text-foreground">
                      Lot {targetLotNumber ?? "—"}
                    </span>
                    . What would you like to do?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleJumpToParsedLot}
                    disabled={jumpingToLot}
                  >
                    {jumpingToLot && <Loader2 className="size-3.5 animate-spin" />}
                    Go to Lot {review.parsed.lotNumber}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setMismatchStep(null);
                      void submitSettlement();
                    }}
                  >
                    I&apos;m sure — apply to Lot {targetLotNumber}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
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
        dragging
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/40"
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
  settlementDate: string; setSettlementDate: (v: string) => void;
  occupancy: "owner_occupied" | "tenanted" | "vacant";
  setOccupancy: (v: "owner_occupied" | "tenanted" | "vacant") => void;
  tenantName: string; setTenantName: (v: string) => void;
  tenantNameInvalid: boolean;
  tenantEmail: string; setTenantEmail: (v: string) => void;
  tenantPhone: string; setTenantPhone: (v: string) => void;
}) {
  const { review } = props;
  const couldNotExtract = !review.parsed.transferee.name && !review.parsed.lotNumber && !review.parsed.settlementDate;

  return (
    <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
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
            <PlacesAutocomplete
              id="settlement-postal"
              value={props.postalAddress}
              onChange={props.setPostalAddress}
              placeholder="For correspondence — used as absent-owner address if different from the lot"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="settlement-date">
              Settlement date <span className="text-destructive">*</span>
            </Label>
            <DatePicker
              id="settlement-date"
              value={props.settlementDate}
              onChange={props.setSettlementDate}
            />
          </div>
        </div>

        <OccupancyTenantBlock
          occupancy={props.occupancy}
          setOccupancy={props.setOccupancy}
          tenantName={props.tenantName} setTenantName={props.setTenantName}
          tenantNameInvalid={props.tenantNameInvalid}
          tenantEmail={props.tenantEmail} setTenantEmail={props.setTenantEmail}
          tenantPhone={props.tenantPhone} setTenantPhone={props.setTenantPhone}
        />

        <p className="text-xs text-muted-foreground">
          The new owner will appear as <span className="font-medium">Pending invitation</span> on this lot.
          No email is sent — share the invitation link manually when you&apos;re ready.
        </p>
      </div>
    </div>
  );
}


// ─── Manual review form ───────────────────────────────────────────
// Used when the manager opts out of the PDF flow. Same field set as the
// PDF-based form but without the match-pill / parsed-document banner.

function ManualReviewForm(props: {
  lotNumber: number | null;
  lotAddress: string | null;
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  postalAddress: string; setPostalAddress: (v: string) => void;
  settlementDate: string; setSettlementDate: (v: string) => void;
  occupancy: "owner_occupied" | "tenanted" | "vacant";
  setOccupancy: (v: "owner_occupied" | "tenanted" | "vacant") => void;
  tenantName: string; setTenantName: (v: string) => void;
  tenantNameInvalid: boolean;
  tenantEmail: string; setTenantEmail: (v: string) => void;
  tenantPhone: string; setTenantPhone: (v: string) => void;
}) {
  void props.lotNumber;
  return (
    <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          New owner
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="manual-settlement-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="manual-settlement-name"
              value={props.name}
              onChange={(e) => props.setName(e.target.value)}
              placeholder="Full legal name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-settlement-email">Email</Label>
            <Input
              id="manual-settlement-email"
              type="email"
              value={props.email}
              onChange={(e) => props.setEmail(e.target.value)}
              placeholder="owner@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manual-settlement-phone">Phone</Label>
            <Input
              id="manual-settlement-phone"
              value={props.phone}
              onChange={(e) => props.setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="manual-settlement-postal">
              Postal address <span className="text-destructive">*</span>
            </Label>
            <PlacesAutocomplete
              id="manual-settlement-postal"
              value={props.postalAddress}
              onChange={props.setPostalAddress}
              placeholder="Used as the absent-owner / service address for paper notices"
            />
            {props.lotAddress && props.postalAddress === props.lotAddress && (
              <p className="text-xs text-muted-foreground">
                Pre-filled with the lot&apos;s own address — change it if the
                owner is absentee.
              </p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="manual-settlement-date">
              Settlement date <span className="text-destructive">*</span>
            </Label>
            <DatePicker
              id="manual-settlement-date"
              value={props.settlementDate}
              onChange={props.setSettlementDate}
            />
          </div>
        </div>

        <OccupancyTenantBlock
          occupancy={props.occupancy}
          setOccupancy={props.setOccupancy}
          tenantName={props.tenantName} setTenantName={props.setTenantName}
          tenantNameInvalid={props.tenantNameInvalid}
          tenantEmail={props.tenantEmail} setTenantEmail={props.setTenantEmail}
          tenantPhone={props.tenantPhone} setTenantPhone={props.setTenantPhone}
        />

        <p className="text-xs text-muted-foreground">
          The new owner will appear as{" "}
          <span className="font-medium">Pending invitation</span> on this lot.
          No email is sent — share the invitation link manually when you&apos;re
          ready.
        </p>
      </div>
    </div>
  );
}

// Three-state occupancy radio pair + tenant detail fields (only render
// when tenanted). Shared between the PDF-flow ReviewForm and the
// type-it-out ManualReviewForm so they ask the same questions.
function OccupancyTenantBlock({
  occupancy,
  setOccupancy,
  tenantName, setTenantName,
  tenantNameInvalid,
  tenantEmail, setTenantEmail,
  tenantPhone, setTenantPhone,
}: {
  occupancy: "owner_occupied" | "tenanted" | "vacant";
  setOccupancy: (v: "owner_occupied" | "tenanted" | "vacant") => void;
  tenantName: string; setTenantName: (v: string) => void;
  tenantNameInvalid: boolean;
  tenantEmail: string; setTenantEmail: (v: string) => void;
  tenantPhone: string; setTenantPhone: (v: string) => void;
}) {
  const OPTIONS: Array<{ value: typeof occupancy; label: string }> = [
    { value: "owner_occupied", label: "Owner-occupied" },
    { value: "tenanted", label: "Tenanted" },
    { value: "vacant", label: "Vacant" },
  ];
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="space-y-1.5">
        <Label>Occupancy</Label>
        <div role="radiogroup" className="inline-flex rounded-md border border-border bg-cool-muted p-0.5">
          {OPTIONS.map((opt) => {
            const active = occupancy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setOccupancy(opt.value)}
                className={
                  "px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer " +
                  (active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      {occupancy === "tenanted" && (
        <div className="space-y-2 border-t border-border pt-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Tenant</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="settlement-tenant-name">
                Tenant name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="settlement-tenant-name"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Full name"
                aria-invalid={tenantNameInvalid || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settlement-tenant-email">Tenant email</Label>
              <Input
                id="settlement-tenant-email"
                type="email"
                value={tenantEmail}
                onChange={(e) => setTenantEmail(e.target.value)}
                placeholder="tenant@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settlement-tenant-phone">Tenant phone</Label>
              <Input
                id="settlement-tenant-phone"
                value={tenantPhone}
                onChange={(e) => setTenantPhone(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
