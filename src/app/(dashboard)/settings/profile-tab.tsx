"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarCropDialog } from "@/components/shared/avatar-crop-dialog";
import { updateProfile, updateAvatar } from "./actions";
import { ChangeEmailDialog, ChangePasswordDialog } from "./credential-dialogs";
import type { Profile } from "@/lib/auth";

// Saving happens on blur, not on a Save button.
//
// A Save button at the bottom of a settings page makes you remember to press
// it, and punishes you for not. These are independent single fields , there
// is nothing to keep consistent between them , so each one writes when you
// leave it, and only when it actually changed. A toast confirms; nothing
// else moves.
//
// The password box shows a FIXED ten dots. Rendering the real length is a
// small gift to anyone reading over your shoulder, and there is no reason
// for the page to know it anyway.
const MASKED_PASSWORD = "•".repeat(10);

function useFieldSave(initial: string, save: (v: string) => Promise<{ error?: string }>) {
  const [value, setValue] = React.useState(initial);
  const committed = React.useRef(initial);

  async function onBlur() {
    const next = value.trim();
    if (next === committed.current) return; // untouched, nothing to say
    const res = await save(next);
    if (res.error) {
      toast.error(res.error);
      setValue(committed.current); // put back what was there
      return;
    }
    committed.current = next;
    toast.success("Saved");
  }

  return { value, setValue, onBlur };
}

export function ProfileTab({ profile }: { profile: Profile }) {
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatar_url ?? "");
  const [cropOpen, setCropOpen] = React.useState(false);
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const firstName = useFieldSave(profile.first_name ?? "", (v) =>
    updateProfile({ first_name: v }),
  );
  const lastName = useFieldSave(profile.last_name ?? "", (v) =>
    updateProfile({ last_name: v }),
  );

  const initial = (profile.first_name?.[0] ?? profile.email?.[0] ?? "?").toUpperCase();

  async function uploadCropped(blob: Blob) {
    const form = new FormData();
    form.append("file", new File([blob], "avatar.png", { type: "image/png" }));
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Upload failed");
      return;
    }
    setAvatarUrl(data.url);
    const saved = await updateAvatar(data.url);
    if (saved.error) {
      toast.error(saved.error);
      return;
    }
    toast.success("Profile picture updated");
  }

  async function removeImage() {
    setRemoving(true);
    const res = await updateAvatar("");
    setRemoving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setAvatarUrl("");
    toast.success("Profile picture removed");
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Picture, with its actions to the right and the format note beneath
          them , the note explains the buttons, so it belongs under them
          rather than under the avatar. */}
      <div className="flex items-start gap-5">
        <div className="size-24 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-2xl font-semibold text-muted-foreground">
              {initial}
            </div>
          )}
        </div>

        <div className="pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setCropOpen(true)}>
              <Plus className="mr-1.5 size-4" />
              Change image
            </Button>
            <Button
              variant="secondary"
              onClick={removeImage}
              disabled={!avatarUrl}
              loading={removing}
            >
              Remove image
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            We accept PNG, JPG, GIF and WebP under 2MB.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            value={firstName.value}
            onChange={(e) => firstName.setValue(e.target.value)}
            onBlur={firstName.onBlur}
            placeholder="First name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            value={lastName.value}
            onChange={(e) => lastName.setValue(e.target.value)}
            onBlur={lastName.onBlur}
            placeholder="Last name"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="account-email">Email</Label>
            <Input id="account-email" value={profile.email ?? ""} readOnly disabled />
          </div>
          <Button variant="secondary" onClick={() => setEmailOpen(true)}>
            Change email
          </Button>
        </div>

        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="account-password">Password</Label>
            <Input id="account-password" value={MASKED_PASSWORD} readOnly disabled />
          </div>
          <Button variant="secondary" onClick={() => setPasswordOpen(true)}>
            Change password
          </Button>
        </div>
      </div>

      <AvatarCropDialog open={cropOpen} onOpenChange={setCropOpen} onCropped={uploadCropped} />
      <ChangeEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        currentEmail={profile.email ?? ""}
      />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
