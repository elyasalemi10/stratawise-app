"use client";

import { AlertTriangle, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PostGridAddress, VerificationResult } from "@/lib/postgrid/client";

// Dialog that fires when PostGrid returns "corrected" or "failed" for an
// address. Two outcomes:
//   - "Use suggestion"   — adopt PostGrid's correctedAddress (only shown
//                          when status === "corrected").
//   - "Keep as entered"  — go ahead with what the manager typed. The
//                          delivery_log row will carry the failure
//                          status so future sends know they're firing
//                          at an unverified address.
//
// The dialog is intentionally modal — the wizard's Continue handler
// pauses until the manager picks one. There's NO third "edit" option
// per the spec (the manager can always cancel the dialog by closing it
// and re-edit the address themselves).

export type AddressVerificationDialogProps = {
  open: boolean;
  /** The address the manager originally entered. Always shown. */
  original: PostGridAddress | null;
  /** PostGrid's verification result. Null when the dialog hasn't fired
   *  yet — used for the initial render before the verify call returns. */
  result: VerificationResult | null;
  /** "Use suggestion" — invoked only when result.correctedAddress exists. */
  onUseSuggestion: (suggestion: PostGridAddress) => void;
  /** "Keep as entered" — invoked with the original address. */
  onKeepAsEntered: (original: PostGridAddress) => void;
  /** "Cancel / edit" — close the dialog without committing. The wizard
   *  Continue button stays disabled (the manager has to re-fire verify).
   *  Closure via Escape / overlay click also calls this. */
  onCancel: () => void;
};

function formatAddrLines(addr: PostGridAddress): { line1: string; locality: string } {
  const line1 = [addr.line1, addr.line2].filter(Boolean).join(", ");
  const locality = `${addr.city} ${addr.provinceOrState} ${addr.postalOrZip}`.trim();
  return { line1, locality };
}

export function AddressVerificationDialog({
  open,
  original,
  result,
  onUseSuggestion,
  onKeepAsEntered,
  onCancel,
}: AddressVerificationDialogProps) {
  if (!result || !original) return null;
  // Only fires on corrected / failed. "verified" + "unchecked" never
  // surface to the user — the caller commits the address straight away.
  const isCorrected = result.status === "corrected" && result.correctedAddress;
  const isFailed = result.status === "failed";
  if (!isCorrected && !isFailed) return null;
  const suggestion = result.correctedAddress;
  const orig = formatAddrLines(original);
  const sugg = suggestion ? formatAddrLines(suggestion) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCorrected ? (
              <CheckCircle2 className="h-5 w-5 text-amber-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            {isCorrected ? "We found a better match" : "PostGrid couldn't verify this address"}
          </DialogTitle>
          <DialogDescription>
            {isCorrected
              ? "PostGrid suggests a slightly different version of the address. Using their suggestion makes letters more likely to deliver on the first attempt."
              : "PostGrid checked Australia Post records and couldn't confirm the address as deliverable. You can save it anyway — we'll flag every letter we send to it so you can follow up if mail comes back."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">As entered</p>
            <div className="mt-1 flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-foreground">{orig.line1 || "—"}</p>
                <p className="text-muted-foreground">{orig.locality}</p>
              </div>
            </div>
          </div>

          {sugg && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">PostGrid suggestion</p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="text-foreground font-medium">{sugg.line1 || "—"}</p>
                  <p className="text-muted-foreground">{sugg.locality}</p>
                </div>
              </div>
            </div>
          )}

          {isFailed && result.errorMessage && (
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">PostGrid said:</strong> {result.errorMessage}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onKeepAsEntered(original)}
          >
            Keep as entered
          </Button>
          {isCorrected && suggestion && (
            <Button onClick={() => onUseSuggestion(suggestion)}>
              Use suggestion
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
