"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import { Spinner } from "@/components/ui/spinner";

export function StepAvatar({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { user } = useUser();
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const userInitial = user?.firstName?.[0]?.toUpperCase() ?? "?";

  async function handleSave() {
    if (!avatarUrl) {
      onNext();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_url: avatarUrl }),
      });

      if (!res.ok) {
        toast.error("Failed to save profile picture");
        setSaving(false);
        return;
      }
    } catch {
      toast.error("Failed to save profile picture");
      setSaving(false);
      return;
    }

    setSaving(false);
    onNext();
  }

  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold text-foreground">
        Add a profile photo
      </h2>
      <p className="mt-1 text-sm text-muted-foreground mb-8">
        This is optional. You can always change it later in settings.
      </p>

      <div className="flex justify-center mb-8">
        <AvatarUpload
          value={avatarUrl}
          onChange={setAvatarUrl}
          fallbackInitial={userInitial}
        />
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          &larr; Back
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onNext}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Spinner className="mr-2" /> Save</> : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
