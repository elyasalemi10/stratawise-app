"use client";

import { useClerk } from "@clerk/nextjs";
import { Shield, Key } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SecurityTab() {
  const { openUserProfile } = useClerk();

  return (
    <div className="max-w-lg space-y-6">
      {/* Password */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-none">
        <div className="flex items-start gap-4">
          <Key className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Password</p>
            <p className="text-sm text-muted-foreground mt-1">
              Change your password or update your sign-in credentials.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => openUserProfile()}
            >
              Change password
            </Button>
          </div>
        </div>
      </div>

      {/* 2FA */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-none">
        <div className="flex items-start gap-4">
          <Shield className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add an extra layer of security to your account with 2FA.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => openUserProfile()}
            >
              Manage 2FA
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
