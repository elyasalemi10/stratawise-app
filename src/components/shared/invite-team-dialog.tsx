"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inviteStrataManagerSchema, type InviteStrataManagerValues } from "@/lib/validations/invitations";
import { inviteStrataManager } from "@/lib/actions/invitations";

interface InviteTeamDialogProps {
  open: boolean;
  onClose: () => void;
}

export function InviteTeamDialog({ open, onClose }: InviteTeamDialogProps) {
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<InviteStrataManagerValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(inviteStrataManagerSchema) as any,
  });

  async function onSubmit(data: InviteStrataManagerValues) {
    setPending(true);
    const result = await inviteStrataManager(data);
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
          <DialogTitle>Invite team member</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="team-email"
              type="email"
              placeholder="colleague@company.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="team-name"
              placeholder="Jane Smith"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            They will receive a link to join your management company and access all its subdivisions.
          </p>

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
