"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { Building2, Home } from "lucide-react";
import { Suspense } from "react";

function RoleSelector({ onSelect }: { onSelect: (role: string) => void }) {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">How will you use MSM?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose your role to get started</p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onSelect("manager")}
          className="w-full flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 cursor-pointer"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">I&apos;m a strata manager</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              I manage subdivisions, lots, levies, and meetings for owners corporations.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect("lot_owner")}
          className="w-full flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 cursor-pointer"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Home className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">I&apos;m a lot owner</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              I own a lot in a strata subdivision and want to view my levies and documents.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

function SignUpContent() {
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role");
  const inviteToken = searchParams.get("invite");
  const [selectedRole, setSelectedRole] = useState<string | null>(initialRole);

  // If coming from an invitation link, the user is always a lot owner —
  // the inviter is a strata manager creating an account for them. Persist
  // intended_role to Clerk so the webhook + ensureProfile can read it on
  // profile creation; otherwise both default to lot_owner regardless of
  // signup choice.
  if (inviteToken) {
    return (
      <SignUp
        fallbackRedirectUrl={`/invite/${inviteToken}`}
        unsafeMetadata={{ intended_role: "lot_owner" }}
      />
    );
  }

  if (!selectedRole) {
    return <RoleSelector onSelect={setSelectedRole} />;
  }

  // RoleSelector emits "manager" or "lot_owner". The DB enum values are
  // "strata_manager" / "lot_owner" / "super_admin"; map to the DB shape
  // here so the webhook can use intended_role verbatim.
  const intendedRole = selectedRole === "lot_owner" ? "lot_owner" : "strata_manager";
  const redirectUrl = selectedRole === "lot_owner" ? "/onboarding/lot-owner" : "/onboarding";

  return (
    <SignUp
      fallbackRedirectUrl={redirectUrl}
      unsafeMetadata={{ intended_role: intendedRole }}
    />
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}
