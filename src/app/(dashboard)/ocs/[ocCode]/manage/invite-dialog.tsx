"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { EditSheet } from "@/components/shared/edit-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lotOwnerDetailsSchema, type LotOwnerDetailsValues } from "@/lib/validations/invitations";
import { updateLotOwnerDetails } from "./invitation-actions";

// Add-owner / edit-owner drawer for lot detail pages. Save-only (navy
// primary) + Cancel — no separate "Save & invite" any more; portal
// invitations are sent from the Owner tab / lot invite-status surface.

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  ocId: string;
  lotId: string;
  lotNumber: number;
  prefillEmail?: string;
  prefillName?: string;
  prefillPhone?: string;
}

export function InviteDialog({
  open,
  onClose,
  ocId,
  lotId,
  lotNumber,
  prefillEmail,
  prefillName,
  prefillPhone,
}: InviteDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    getValues,
  } = useForm<LotOwnerDetailsValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(lotOwnerDetailsSchema) as any,
    defaultValues: {
      email: prefillEmail ?? "",
      name: prefillName ?? "",
      phone: prefillPhone ?? "",
    },
  });

  // Reset whenever the drawer opens with fresh prefill values so re-using the
  // same modal doesn't carry stale state between owners.
  useEffect(() => {
    if (open) {
      reset({
        email: prefillEmail ?? "",
        name: prefillName ?? "",
        phone: prefillPhone ?? "",
      });
    }
  }, [open, prefillEmail, prefillName, prefillPhone, reset]);

  // Resolves with the next form values via handleSubmit so EditSheet's onSave
  // hook can await the validation outcome.
  function getValidatedValues(): Promise<LotOwnerDetailsValues | null> {
    return new Promise((resolve) => {
      void handleSubmit(
        (data) => resolve(data),
        () => resolve(null),
      )();
    });
  }

  // Surface server-side errors inline as a string EditSheet renders for us.
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setServerError(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [open]);

  return (
    <EditSheet
      label={`Owner — Lot ${lotNumber}`}
      description="Name is required. Email + phone are optional."
      headerKicker={null}
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      renderTrigger={() => <span />}
      saveLabel="Save"
      onSave={async () => {
        setServerError(null);
        const data = await getValidatedValues();
        if (!data) {
          const firstError = Object.values(errors)[0]?.message;
          return {
            ok: false as const,
            error: firstError ?? "Please fix the highlighted fields.",
          };
        }
        const result = await updateLotOwnerDetails(ocId, lotId, {
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
        });
        if (result.error) {
          setServerError(result.error);
          return { ok: false as const, error: result.error };
        }
        toast.success("Owner details saved");
        return { ok: true as const };
      }}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => e.preventDefault()}
        // Hint browsers not to autofill an unrelated card-payment field set.
        autoComplete="off"
      >
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">
            Full name <span className="text-destructive">*</span>
          </Label>
          <Input id="invite-name" placeholder="John Smith" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="owner@example.com"
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-phone">Phone</Label>
          <Input
            id="invite-phone"
            placeholder="+61 400 000 000"
            {...register("phone")}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Lot number</Label>
          <Input value={String(lotNumber)} disabled className="bg-muted" />
        </div>

        {serverError && (
          <p className="text-xs text-destructive">{serverError}</p>
        )}

        {/* Suppress unused-var lint: form uses register/handleSubmit, but the
            getValues helper is intentionally kept for future server-side
            inspection of the staged values. */}
        <input type="hidden" data-form-snapshot={JSON.stringify(getValues())} />
      </form>
    </EditSheet>
  );
}
