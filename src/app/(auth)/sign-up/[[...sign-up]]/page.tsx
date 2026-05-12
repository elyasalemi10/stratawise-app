"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, Home, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

type Role = "strata_manager" | "lot_owner";

function RoleSelector({ onSelect }: { onSelect: (role: Role) => void }) {
  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Create your account.
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Strata works when everyone&apos;s on the same page.
        </p>
        <p className="mt-1 text-base text-muted-foreground leading-relaxed">
          Choose your role to begin.
        </p>
      </div>

      <div className="mx-auto w-full max-w-md space-y-3">
        <button
          type="button"
          onClick={() => onSelect("strata_manager")}
          className="w-full flex items-start gap-4 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/30"
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
          className="w-full flex items-start gap-4 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted/30"
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

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function SignUpForm({ role, inviteToken }: { role: Role; inviteToken: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

    if (!data.session) {
      // Should not happen with email confirmation disabled in Supabase, but if
      // it does we can't proceed — direct user to sign in.
      toast.error("Sign-up succeeded but no session was returned. Please sign in.");
      window.location.href = "/sign-in";
      return;
    }

    // Land on /verify-email — page auto-sends a 6-digit code on mount,
    // user enters it, then continues to /onboarding (or invite flow).
    sessionStorage.removeItem("verifyEmail.codeSent");
    window.location.href = inviteToken
      ? `/verify-email?next=/invite/${inviteToken}`
      : "/verify-email";
  }

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Create your account.
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Signing up as a {role === "strata_manager" ? "strata manager" : "lot owner"}.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-11"
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
              className="h-11"
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
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 border border-foreground/15 shadow-sm"
          disabled={pending}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
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
