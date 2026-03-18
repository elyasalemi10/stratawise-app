"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { profileSchema, type ProfileFormValues } from "@/lib/validations/settings";
import { updateProfile, updateAvatar } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import type { Profile } from "@/lib/auth";

export function ProfileTab({ profile }: { profile: Profile }) {
  const [pending, setPending] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(profileSchema) as any,
    defaultValues: {
      first_name: profile.first_name ?? "",
      last_name: profile.last_name ?? "",
      phone: profile.phone ?? "",
      postal_address: profile.postal_address ?? "",
    },
  });

  async function onSubmit(data: ProfileFormValues) {
    setPending(true);
    const result = await updateProfile(data);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Profile updated");
  }

  async function handleAvatarChange(url: string) {
    setAvatarUrl(url);
    const result = await updateAvatar(url);
    if (result.error) {
      toast.error(result.error);
    }
  }

  const initials = [profile.first_name?.[0], profile.last_name?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || "?";

  return (
    <div className="max-w-lg space-y-6">
      {/* Avatar */}
      <div className="space-y-1.5">
        <Label>Profile picture</Label>
        <AvatarUpload
          value={avatarUrl}
          onChange={handleAvatarChange}
          fallbackInitial={initials}
        />
      </div>

      {/* Profile form */}
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-first-name">
              First name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="settings-first-name"
              placeholder="Jane"
              autoComplete="off"
              aria-invalid={!!errors.first_name}
              {...register("first_name")}
            />
            {errors.first_name && (
              <p className="text-xs text-destructive mt-1">{errors.first_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-last-name">
              Last name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="settings-last-name"
              placeholder="Smith"
              autoComplete="off"
              aria-invalid={!!errors.last_name}
              {...register("last_name")}
            />
            {errors.last_name && (
              <p className="text-xs text-destructive mt-1">{errors.last_name.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-phone">Phone</Label>
          <Input
            id="settings-phone"
            placeholder="+61 412 345 678"
            autoComplete="off"
            {...register("phone")}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-postal">Postal address</Label>
          <Input
            id="settings-postal"
            placeholder="PO Box 123, Melbourne VIC 3000"
            autoComplete="off"
            {...register("postal_address")}
          />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? <><Spinner className="mr-2" /> Save</> : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
