"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/shared/otp-input";
import { sendVerificationCode, verifyEmailCode } from "@/lib/actions/email-verification";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/onboarding";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [resending, setResending] = useState(false);
  const autoSent = useRef(false);

  // Auto-send a code on first mount so the user lands on a "code in inbox"
  // state immediately after signup. sessionStorage guards against the
  // 30-second rate limit if the user reloads the page.
  useEffect(() => {
    if (autoSent.current) return;
    if (typeof window === "undefined") return;
    autoSent.current = true;
    if (sessionStorage.getItem("verifyEmail.codeSent") === "1") return;
    sendVerificationCode().then((r) => {
      if ("error" in r) {
        toast.error(r.error);
      } else {
        sessionStorage.setItem("verifyEmail.codeSent", "1");
        toast.success("Code sent to your email.");
      }
    });
  }, []);

  async function handleVerify(value: string) {
    setVerifying(true);
    setInvalid(false);
    const result = await verifyEmailCode(value);

    if ("error" in result) {
      setInvalid(true);
      setVerifying(false);
      toast.error(result.error);
      return;
    }

    // Don't flip verifying back to false — keep the button disabled while we
    // navigate so the user never sees the "un-greyed" state that suggests
    // failure. The page unmount on navigation clears the state naturally.
    sessionStorage.removeItem("verifyEmail.codeSent");
    window.location.href = next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setInvalid(true);
      toast.error("Enter all 6 digits.");
      return;
    }
    await handleVerify(code);
  }

  async function handleResend() {
    setResending(true);
    const result = await sendVerificationCode();
    setResending(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setCode("");
    setInvalid(false);
    sessionStorage.setItem("verifyEmail.codeSent", "1");
    toast.success("New code sent.");
  }

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Verify your email
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          Enter the 6-digit code we sent to your email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (invalid) setInvalid(false);
          }}
          onComplete={(v) => handleVerify(v)}
          disabled={verifying}
          invalid={invalid}
          autoFocus
        />

        <Button
          type="submit"
          className="w-full h-11 border border-foreground/15 shadow-sm"
          disabled={verifying || code.length !== 6}
        >
          {verifying && <Loader2 className="size-4 animate-spin" />}
          Verify email
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

      <p className="text-center text-xs text-muted-foreground">
        Code expires in 10 minutes. Check your spam folder.
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
