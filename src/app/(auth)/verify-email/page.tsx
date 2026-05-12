"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/shared/otp-input";
import { sendVerificationCode, verifyEmailCode } from "@/lib/actions/email-verification";
import { getSupabaseClient } from "@/lib/supabase";

// Gmail web client deep-link that pre-filters to our sender so the user
// finds the code instantly. Works for any signed-in Gmail account.
const GMAIL_SEARCH_URL =
  "https://mail.google.com/mail/u/0/#search/from%3Anoreply%40myocm.com.au";

// Inline Gmail "M" logo SVG — the brand mark in 4 colours. Kept inline so
// we don't depend on a third-party icon library + we control sizing.
function GmailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <path d="M22 5.5L13.5 12.06a2.5 2.5 0 0 1-3 0L2 5.5v13A1.5 1.5 0 0 0 3.5 20h17a1.5 1.5 0 0 0 1.5-1.5v-13z" fill="#E4E4E7"/>
      <path d="M22 5.5l-8.5 6.56a2.5 2.5 0 0 1-3 0L2 5.5V4a1.5 1.5 0 0 1 1.5-1.5h17A1.5 1.5 0 0 1 22 4v1.5z" fill="#EA4335"/>
      <path d="M2 5.5V4a1.5 1.5 0 0 1 1.5-1.5H6L11 7l1 1L2 5.5z" fill="#C5221F"/>
      <path d="M22 5.5V4a1.5 1.5 0 0 0-1.5-1.5H18L13 7l-1 1 10-2.5z" fill="#FBBC04"/>
      <path d="M11 7l-9-2.5V18.5A1.5 1.5 0 0 0 3.5 20H6V12l5-5z" fill="#34A853"/>
      <path d="M13 7l9-2.5V18.5A1.5 1.5 0 0 1 20.5 20H18V12l-5-5z" fill="#4285F4"/>
    </svg>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/onboarding";
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [resending, setResending] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const autoSent = useRef(false);

  // Resolve the signed-in user's email so we can show it explicitly.
  // First check the sessionStorage breadcrumb signup-flow leaves, then
  // fall back to a Supabase Auth lookup.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cached = sessionStorage.getItem("verifyEmail.email");
    if (cached) {
      setUserEmail(cached);
      return;
    }
    getSupabaseClient().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  // Auto-send a code on first mount.
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

    // Keep button greyed through navigation — page unmount clears state.
    sessionStorage.removeItem("verifyEmail.codeSent");
    sessionStorage.removeItem("verifyEmail.email");
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
          Enter the 6-digit code we sent to{" "}
          <strong className="text-foreground">
            {userEmail ?? "your email"}
          </strong>
          .
        </p>
        <div className="mt-4 flex justify-center">
          <a
            href={GMAIL_SEARCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <GmailIcon className="size-4" />
            Open in Gmail
          </a>
        </div>
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
