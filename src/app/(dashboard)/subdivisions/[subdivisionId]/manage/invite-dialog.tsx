"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inviteLotOwnerSchema, type InviteLotOwnerValues } from "@/lib/validations/invitations";
import { inviteLotOwner } from "./invitation-actions";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  subdivisionId: string;
  lotId: string;
  lotNumber: number;
  prefillEmail?: string;
  prefillName?: string;
}

export function InviteDialog({
  open,
  onClose,
  subdivisionId,
  lotId,
  lotNumber,
  prefillEmail,
  prefillName,
}: InviteDialogProps) {
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InviteLotOwnerValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(inviteLotOwnerSchema) as any,
    defaultValues: {
      email: prefillEmail ?? "",
      name: prefillName ?? "",
      phone: "",
    },
  });

  async function onSubmit(data: InviteLotOwnerValues) {
    setPending(true);
    const result = await inviteLotOwner(subdivisionId, lotId, {
      email: data.email,
      name: data.name,
      phone: data.phone,
    });
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Invitation sent", {
      description: `An email has been sent to ${data.email}.`,
    });

    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={() => { reset(); onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite lot owner — Lot {lotNumber}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">
              Email <span className="text-destructive">*</span>
            </Label>
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
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
