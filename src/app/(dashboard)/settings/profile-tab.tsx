"use client";

import * as React from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarCropDialog } from "@/components/shared/avatar-crop-dialog";
import { useFieldSave } from "./use-field-save";
import { revalidateSidebarFromClient } from "@/lib/sidebar-cache";
import { updateProfile, updateAvatar } from "./actions";
import { ChangeEmailDialog, ChangePasswordDialog } from "./credential-dialogs";
import type { ProfileSettings } from "./data";

// The password box shows a FIXED ten dots. Rendering the real length is a
// small gift to anyone reading over your shoulder, and there is no reason
// for the page to know it anyway.
const MASKED_PASSWORD = "•".repeat(10);

export function ProfileTab({ profile }: { profile: ProfileSettings }) {
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatar_url ?? "");
  // Picking comes first, framing second. "Change image" opens the file
  // picker; the cropper appears only once there is something to crop, so
  // there is never a dialog sitting there asking you to choose.
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
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
    // Tell the rest of the chrome. The header and sidebar hold their own
    // copy of the profile, so without this the new picture appears on this
    // page and the old one stays in the corner of every screen until a hard
    // reload , which reads as the upload having half-worked.
    revalidateSidebarFromClient();
    toast.success("Profile picture updated");
  }

  const MAX_BYTES = 2 * 1024 * 1024;

  function pickFile(file: File) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast.error("Use a PNG, JPG, GIF or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is over 2MB.");
      return;
    }
    setPendingFile(file);
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
    revalidateSidebarFromClient();
    toast.success("Profile picture removed");
  }

  return (
    <div className="space-y-8">
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
            <Button onClick={() => fileRef.current?.click()}>
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
            onChange={(e) => firstName.onChange(e.target.value)}
            onBlur={firstName.onBlur}
            placeholder="First name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            value={lastName.value}
            onChange={(e) => lastName.onChange(e.target.value)}
            onBlur={lastName.onBlur}
            placeholder="Last name"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-6 border-b border-border pb-3 text-lg font-semibold text-foreground">
          Account Security
        </h3>

        {/* These two are read-only, so they do not need the full width the
            editable fields above take , sizing them to their content and
            pushing the action to the far edge makes it obvious the box is not
            where the change happens. Both the same width so the rows line up. */}
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="w-full max-w-sm space-y-1.5">
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" value={profile.email ?? ""} readOnly disabled />
            </div>
            <Button variant="secondary" className="ml-auto" onClick={() => setEmailOpen(true)}>
              Change email
            </Button>
          </div>

          <div className="flex items-end gap-3">
            <div className="w-full max-w-sm space-y-1.5">
              <Label htmlFor="account-password">Password</Label>
              <Input id="account-password" value={MASKED_PASSWORD} readOnly disabled />
            </div>
            <Button variant="secondary" className="ml-auto" onClick={() => setPasswordOpen(true)}>
              Change password
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
          // Reset, so re-choosing the SAME file still fires onChange.
          e.currentTarget.value = "";
        }}
      />

      <AvatarCropDialog
        file={pendingFile}
        onOpenChange={(o) => { if (!o) setPendingFile(null); }}
        onCropped={uploadCropped}
      />
      <ChangeEmailDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        currentEmail={profile.email ?? ""}
      />
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
