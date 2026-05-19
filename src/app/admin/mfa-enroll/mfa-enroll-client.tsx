"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

// First-time TOTP enrolment. We:
//   1. POST /factors via supabase.auth.mfa.enroll → returns { id, totp.qr_code, secret }
//   2. Show the QR + manual secret, ask the user to scan with an authenticator
//   3. They enter the 6-digit code → supabase.auth.mfa.challenge + verify
//   4. On verify success, Supabase auto-promotes the session to AAL2 →
//      redirect to /admin
//
// We render the QR with <Image unoptimized> using the data-URL Supabase
// returns. The "secret" string is shown beside it for users whose
// authenticator can't scan (rare on desktop).

export function MfaEnrollClient() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enrolling, setEnrolling] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      const sb = getSupabaseClient();
      const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp" });
      if (cancelled) return;
      if (error || !data) {
        setEnrollError(error?.message ?? "Couldn't start MFA enrolment.");
        setEnrolling(false);
        return;
      }
      // Supabase returns the QR as a raw SVG markup string. Per their docs
      // we prepend the data URI prefix to use it directly in an <img src>.
      const qrSrcFull = data.totp?.qr_code
        ? `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`
        : null;
      setFactorId(data.id);
      setQrSrc(qrSrcFull);
      setSecret(data.totp?.secret ?? null);
      setEnrolling(false);
    }
    void go();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    const digits = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(digits)) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setVerifying(true);
    const sb = getSupabaseClient();
    // challengeAndVerify is the combined helper — creates a challenge and
    // immediately verifies it with the user's code.
    const { error } = await sb.auth.mfa.challengeAndVerify({
      factorId,
      code: digits,
    });
    setVerifying(false);
    if (error) {
      toast.error(error.message || "That code didn't match — try again.");
      return;
    }
    toast.success("MFA enabled. You're set.");
    router.replace("/admin");
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    toast.success("Secret copied to clipboard.");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-5 w-5 text-[color:var(--brand-gold)]" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Set up multi-factor authentication
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Super admin accounts require an authenticator app. Scan the QR code
        with Authy / Google Authenticator / 1Password, then enter the
        6-digit code to finish.
      </p>

      <Card>
        <CardContent className="space-y-5 pt-5">
          {enrolling && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {enrollError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {enrollError}
            </div>
          )}
          {!enrolling && qrSrc && (
            <>
              <div className="flex justify-center">
                <div className="rounded-md border border-border bg-card p-2">
                  <Image
                    src={qrSrc}
                    alt="MFA QR code"
                    width={192}
                    height={192}
                    unoptimized
                    className="size-48"
                  />
                </div>
              </div>
              {secret && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Or paste this secret manually
                  </Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-border bg-cool-muted px-3 py-2 font-mono text-xs break-all text-cool-muted-foreground">
                      {secret}
                    </code>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={copySecret}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              <form onSubmit={handleVerify} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-code">
                    Code from your authenticator{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifying || code.length !== 6}
                >
                  {verifying && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  Verify and enable MFA
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
