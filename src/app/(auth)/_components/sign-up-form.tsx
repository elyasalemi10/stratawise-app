"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

// Public sign-up form. Creates a Supabase auth user, kicks the verification
// email (Supabase Auth) AND seeds the user_metadata with first/last so the
// profile-ensure step picks them up. After successful sign-up we route to
// /verify-email; from there → /onboarding/setup once verified.

function SignUpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/onboarding";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [invalid, setInvalid] = useState<{
    firstName?: boolean;
    email?: boolean;
    password?: boolean;
  }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problems: string[] = [];
    const nextInvalid: typeof invalid = {};
    if (!firstName.trim()) {
      problems.push("First name is required");
      nextInvalid.firstName = true;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      problems.push("Enter a valid email");
      nextInvalid.email = true;
    }
    if (password.length < 8) {
      problems.push("Password must be at least 8 characters");
      nextInvalid.password = true;
    }
    setInvalid(nextInvalid);
    if (problems.length) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
        },
      },
    });

    if (error) {
      setPending(false);
      toast.error(error.message);
      return;
    }

    // Keep pending true through the hard navigation so the button doesn't
    // un-grey before /verify-email loads.
    window.location.href = `/verify-email?next=${encodeURIComponent(nextPath)}`;
  }

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Create your StrataWise account
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Built for Victorian strata managers. Designed around the Owners
          Corporations Act.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">
              First name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="first-name"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (invalid.firstName) setInvalid((p) => ({ ...p, firstName: false }));
              }}
              aria-invalid={invalid.firstName || undefined}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Last name</Label>
            <Input
              id="last-name"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (invalid.email) setInvalid((p) => ({ ...p, email: false }));
            }}
            aria-invalid={invalid.email || undefined}
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">
            Password <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (invalid.password) setInvalid((p) => ({ ...p, password: false }));
              }}
              aria-invalid={invalid.password || undefined}
              // Typed dots at text-base (readable bullets); placeholder
              // stays text-sm to match the email field.
              className="h-11 pr-10 text-base placeholder:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
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

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/"
            className="font-medium text-[color:var(--brand-gold)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        By creating an account you agree to our{" "}
        <Link href="/legal/terms" className="underline">Terms</Link> and{" "}
        <Link href="/legal/privacy" className="underline">Privacy Policy</Link>.
      </p>

      {/* Keep router referenced to satisfy lint when we wire it later (e.g.
          deep-link to /verify-email with a router.replace transition). */}
      <input type="hidden" data-router-mounted={typeof router !== "undefined" ? "1" : "0"} />
    </div>
  );
}

export function SignUpForm() {
  return (
    <Suspense>
      <SignUpContent />
    </Suspense>
  );
}
