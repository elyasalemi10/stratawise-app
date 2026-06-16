"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarUpload } from "@/components/shared/avatar-upload";
import {
  updateAdminProfile, updateAdminAvatar, changeAdminPassword,
} from "./actions";

export interface AdminSettingsProfile {
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string;
}

function ProfileTab({ profile }: { profile: AdminSettingsProfile }) {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [firstNameInvalid, setFirstNameInvalid] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleAvatar(url: string) {
    setAvatarUrl(url);
    const res = await updateAdminAvatar(url);
    if (res.error) toast.error(res.error);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) {
      setFirstNameInvalid(true);
      toast.error("First name is required.");
      return;
    }
    setPending(true);
    const res = await updateAdminProfile({ firstName, lastName });
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Profile updated");
  }

  const initial = (firstName || profile.email)?.[0]?.toUpperCase() ?? "S";

  return (
    <form onSubmit={onSave} className="max-w-lg space-y-6">
      <div className="space-y-1.5">
        <Label>Profile picture</Label>
        <AvatarUpload value={avatarUrl} onChange={handleAvatar} fallbackInitial={initial} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="admin-first">
            First name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="admin-first"
            value={firstName}
            aria-invalid={firstNameInvalid || undefined}
            onChange={(e) => {
              setFirstName(e.target.value);
              setFirstNameInvalid(false);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-last">Last name</Label>
          <Input id="admin-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-email">Email</Label>
        <Input
          id="admin-email"
          value={profile.email}
          disabled
          className="bg-cool-muted text-cool-muted-foreground"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [invalid, setInvalid] = useState<{ current?: boolean; next?: boolean; confirm?: boolean }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    const next_: typeof invalid = {};
    if (!current) { problems.push("Enter your current password."); next_.current = true; }
    if (next.length < 8) { problems.push("New password must be at least 8 characters."); next_.next = true; }
    if (confirm !== next) { problems.push("Passwords don't match."); next_.confirm = true; }
    if (problems.length) {
      setInvalid(next_);
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }
    setPending(true);
    const res = await changeAdminPassword(current, next);
    setPending(false);
    if (res.error) {
      if (res.error.toLowerCase().includes("current password")) setInvalid({ current: true });
      toast.error(res.error);
      return;
    }
    toast.success("Password changed");
    setCurrent(""); setNext(""); setConfirm(""); setInvalid({});
  }

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardContent className="pt-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-foreground">
            Change password
          </h3>
          <form onSubmit={onSubmit} autoComplete="off" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cur-pw">
                Current password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cur-pw" type="password" autoComplete="off"
                value={current}
                aria-invalid={invalid.current || undefined}
                onChange={(e) => { setCurrent(e.target.value); setInvalid((p) => ({ ...p, current: false })); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">
                New password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-pw" type="password" autoComplete="off"
                value={next}
                aria-invalid={invalid.next || undefined}
                onChange={(e) => { setNext(e.target.value); setInvalid((p) => ({ ...p, next: false })); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conf-pw">
                Confirm new password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="conf-pw" type="password" autoComplete="off"
                value={confirm}
                aria-invalid={invalid.confirm || undefined}
                onChange={(e) => { setConfirm(e.target.value); setInvalid((p) => ({ ...p, confirm: false })); }}
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <span className="text-sm text-muted-foreground">Multi-factor authentication</span>
          <span className="text-sm font-medium text-foreground">Enabled (authenticator app)</span>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTabsInner({ profile }: { profile: AdminSettingsProfile }) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "profile");

  function onTabChange(value: string) {
    setActiveTab(value);
    window.history.replaceState(null, "", `/admin/settings?tab=${value}`);
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList variant="line">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-6">
        <div className={activeTab === "profile" ? "" : "hidden"}>
          <ProfileTab profile={profile} />
        </div>
        <div className={activeTab === "security" ? "" : "hidden"}>
          <SecurityTab />
        </div>
      </div>
    </div>
  );
}

export function SettingsTabs({ profile }: { profile: AdminSettingsProfile }) {
  return (
    <Suspense>
      <SettingsTabsInner profile={profile} />
    </Suspense>
  );
}
