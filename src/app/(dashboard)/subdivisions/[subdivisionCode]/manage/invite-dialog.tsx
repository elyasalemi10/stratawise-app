"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lotOwnerDetailsSchema, type LotOwnerDetailsValues } from "@/lib/validations/invitations";
import { inviteLotOwner, updateLotOwnerDetails } from "./invitation-actions";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  subdivisionId: string;
  lotId: string;
  lotNumber: number;
  prefillEmail?: string;
  prefillName?: string;
  prefillPhone?: string;
}

export function InviteDialog({
  open,
  onClose,
  subdivisionId,
  lotId,
  lotNumber,
  prefillEmail,
  prefillName,
  prefillPhone,
}: InviteDialogProps) {
  const [savingOnly, setSavingOnly] = useState(false);
  const [sending, setSending] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<LotOwnerDetailsValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(lotOwnerDetailsSchema) as any,
    defaultValues: {
      email: prefillEmail ?? "",
      name: prefillName ?? "",
      phone: prefillPhone ?? "",
    },
  });

  const emailValue = watch("email");
  const hasEmail = (emailValue ?? "").trim().length > 0;

  function close() {
    reset();
    onClose();
  }

  async function handleSave(data: LotOwnerDetailsValues) {
    setSavingOnly(true);
    const result = await updateLotOwnerDetails(subdivisionId, lotId, {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
    });
    setSavingOnly(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Owner details saved");
    close();
  }

  async function handleSend(data: LotOwnerDetailsValues) {
    if (!data.email) {
      toast.error("Add an email address before sending an invitation");
      return;
    }
    setSending(true);
    const result = await inviteLotOwner(subdivisionId, lotId, {
      email: data.email,
      name: data.name,
      phone: data.phone,
    });
    setSending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Invitation sent", {
      description: `An email has been sent to ${data.email}.`,
    });
    close();
  }

  return (
    <Dialog open={open} onOpenChange={() => close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Owner — Lot {lotNumber}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-name"
              placeholder="John Smith"
              {...register("name")}
            />
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
            <p className="text-xs text-muted-foreground">
              Optional when saving. Required to send the invitation email.
            </p>
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSubmit(handleSave)}
              disabled={savingOnly || sending}
            >
              {savingOnly ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              onClick={handleSubmit(handleSend)}
              disabled={!hasEmail || savingOnly || sending}
            >
              {sending ? "Sending..." : "Save & invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
