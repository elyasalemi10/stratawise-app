"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpInput } from "@/components/shared/otp-input";
import {
  requestPasswordResetCode,
  resetPasswordWithCode,
} from "@/lib/actions/password-reset";

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_HINT = "8+ characters, one letter, one special symbol.";

type Phase = "request" | "reset";

export default function ForgotPasswordPage() {
  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [code, setCode] = useState("");
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [pwInvalid, setPwInvalid] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [confirmInvalid, setConfirmInvalid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setEmailInvalid(true);
      toast.error("Enter a valid email.");
      return;
    }
    setEmailInvalid(false);
    setPending(true);
    const r = await requestPasswordResetCode(email.trim());
    setPending(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("If that email is registered, a code is on its way.");
    setPhase("reset");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    // Multi-error validation (per CLAUDE.md form-validation rule)
    const problems: string[] = [];
    const codeOk = /^\d{6}$/.test(code);
    if (!codeOk) problems.push("Enter the 6-digit code from your email.");
    const pwOk = PASSWORD_RULE.test(password);
    if (!pwOk) problems.push(`New password too weak — ${PASSWORD_HINT}`);
    const confirmOk = password === confirm;
    if (!confirmOk) problems.push("Passwords don't match.");
    setCodeInvalid(!codeOk);
    setPwInvalid(!pwOk);
    setConfirmInvalid(!confirmOk);
    if (problems.length > 0) {
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const r = await resetPasswordWithCode(email.trim(), code, password);
    if ("error" in r) {
      setPending(false);
      setCodeInvalid(true);
      toast.error(r.error);
      return;
    }
    toast.success("Password updated. Sign in below.");
    // Keep pending true through the redirect so the button doesn't un-grey
    window.location.href = "/sign-in";
  }

  async function handleResend() {
    setResending(true);
    const r = await requestPasswordResetCode(email.trim());
    setResending(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setCode("");
    setCodeInvalid(false);
    toast.success("New code sent.");
  }

  if (phase === "request") {
    return (
      <div className="w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Forgot password?
          </h1>
          <p className="mt-2 text-base text-muted-foreground leading-relaxed">
            Enter the email you signed up with.
            <br />
            We&apos;ll send you a 6-digit code to set a new password.
          </p>
        </div>

        <form onSubmit={handleRequest} className="mx-auto w-full max-w-sm space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailInvalid) setEmailInvalid(false);
              }}
              aria-invalid={emailInvalid || undefined}
              className="h-11"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 border border-foreground/15 shadow-sm"
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Send code
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Remember your password?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  // phase === "reset"
  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="mt-2 text-base text-muted-foreground leading-relaxed">
          Enter the 6-digit code we sent to <strong>{email}</strong> and choose
          a new password.
        </p>
      </div>

      <form onSubmit={handleReset} className="mx-auto w-full max-w-sm space-y-4">
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (codeInvalid) setCodeInvalid(false);
          }}
          length={6}
          invalid={codeInvalid}
          disabled={pending}
        />

        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (pwInvalid) setPwInvalid(false);
              }}
              aria-invalid={pwInvalid || undefined}
              className="h-11 pr-10"
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
          <p className="text-xs text-muted-foreground">{PASSWORD_HINT}</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Repeat the password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (confirmInvalid) setConfirmInvalid(false);
            }}
            aria-invalid={confirmInvalid || undefined}
            className="h-11"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-11 border border-foreground/15 shadow-sm"
          disabled={pending}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Reset password
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        Didn&apos;t get the code?{" "}
        <button
          type="button"
          disabled={resending}
          onClick={handleResend}
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50"
        >
          {resending && <Loader2 className="size-3 animate-spin" />}
          Resend
        </button>
      </div>
    </div>
  );
}
