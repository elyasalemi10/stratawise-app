"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Home, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Role = "strata_manager" | "lot_owner";

function RoleSelector({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground">
          How will you use Strata Wise?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your role to get started
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onSelect("strata_manager")}
          className="w-full flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 cursor-pointer"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              I&apos;m a strata manager
            </p>
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
            <p className="text-sm font-medium text-foreground">
              I&apos;m a lot owner
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              I own a lot in a strata subdivision and want to view my levies and documents.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

function SignUpForm({ role, inviteToken }: { role: Role; inviteToken: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setPending(true);

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          first_name: firstName,
          last_name: lastName,
          intended_role: role,
        },
      },
    });

    setPending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data.user && !data.session) {
      // Email confirmation required
      toast.success("Check your email to confirm your account.");
      return;
    }

    // Email confirmation disabled — already signed in
    const redirectUrl = inviteToken
      ? `/invite/${inviteToken}`
      : role === "lot_owner"
      ? "/onboarding/lot-owner"
      : "/onboarding";
    window.location.href = redirectUrl;
  }

  return (
    <div className="w-full max-w-sm">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">Create account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {role === "strata_manager" ? "Strata manager" : "Lot owner"} signup
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
            </div>

            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SignUpContent() {
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") as Role | null;
  const inviteToken = searchParams.get("invite");
  const [selectedRole, setSelectedRole] = useState<Role | null>(
    inviteToken ? "lot_owner" : initialRole,
  );

  if (!selectedRole) {
    return <RoleSelector onSelect={setSelectedRole} />;
  }

  return <SignUpForm role={selectedRole} inviteToken={inviteToken} />;
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}
