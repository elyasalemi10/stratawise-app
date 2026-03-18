"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { changePasswordSchema, type ChangePasswordFormValues } from "@/lib/validations/settings";
import { changePassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function SecurityTab() {
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(changePasswordSchema) as any,
  });

  async function onSubmit(data: ChangePasswordFormValues) {
    setPending(true);
    const result = await changePassword(data.currentPassword, data.newPassword);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Password changed successfully");
    reset();
  }

  return (
    <div className="max-w-lg">
      <div className="rounded-lg border border-border bg-card p-5 shadow-none">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground mb-4">
          Change password
        </h3>

        <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">
              Current password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="off"
              aria-invalid={!!errors.currentPassword}
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive mt-1">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">
              New password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="off"
              aria-invalid={!!errors.newPassword}
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive mt-1">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">
              Confirm new password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="off"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? <><Spinner className="mr-2" /> Update</> : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
