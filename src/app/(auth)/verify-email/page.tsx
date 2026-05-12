"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendVerificationCode, verifyEmailCode } from "@/lib/actions/email-verification";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/onboarding";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [autoSent, setAutoSent] = useState(false);

  // Auto-send a code on first mount so the user lands on a "code in inbox"
  // state immediately after signup. Skipped on subsequent mounts via the
  // sessionStorage flag below so a page refresh doesn't trigger the
  // 30-second rate limit.
  useEffect(() => {
    if (autoSent) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("verifyEmail.codeSent") === "1") {
      setAutoSent(true);
      return;
    }
    setAutoSent(true);
    sendVerificationCode().then((r) => {
      if ("error" in r) {
        toast.error(r.error);
      } else {
        sessionStorage.setItem("verifyEmail.codeSent", "1");
        toast.success("Code sent to your email.");
      }
    });
  }, [autoSent]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    const result = await verifyEmailCode(code);
    setVerifying(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    sessionStorage.removeItem("verifyEmail.codeSent");
    toast.success("Email verified.");
    window.location.href = next;
  }

  async function handleResend() {
    setResending(true);
    const result = await sendVerificationCode();
    setResending(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    sessionStorage.setItem("verifyEmail.codeSent", "1");
    toast.success("New code sent.");
  }

  return (
    <div className="w-full max-w-sm">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">Verify your email</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the 6-digit code we sent to your email.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-lg tracking-[0.5em] tabular-nums"
              />
            </div>

            <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
              {verifying && <Loader2 className="size-4 animate-spin" />}
              Verify email
            </Button>
          </form>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={resending}
            onClick={handleResend}
          >
            {resending && <Loader2 className="size-4 animate-spin" />}
            Resend code
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Code expires in 10 minutes. Check your spam folder if you don&apos;t see it.
          </p>
        </CardContent>
      </Card>
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
