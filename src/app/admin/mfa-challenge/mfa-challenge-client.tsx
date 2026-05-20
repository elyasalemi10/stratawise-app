"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";
import { logMfaEvent } from "../internal-actions/audit";

// Re-verify TOTP after sign-in. The user already has a verified factor;
// we pick the first TOTP factor, call challengeAndVerify with their code,
// and let Supabase promote the session to AAL2.

export function MfaChallengeClient() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const sb = getSupabaseClient();
      const { data } = await sb.auth.mfa.listFactors();
      if (cancelled) return;
      const verified = (data?.totp ?? []).find((f) => f.status === "verified");
      setFactorId(verified?.id ?? null);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    const digits = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(digits)) {
      toast.error("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setVerifying(true);
    const sb = getSupabaseClient();
    const { error } = await sb.auth.mfa.challengeAndVerify({
      factorId,
      code: digits,
    });
    setVerifying(false);
    if (error) {
      void logMfaEvent("mfa_verify_failed", { reason: error.message, factorId });
      toast.error(error.message || "That code didn't match — try again.");
      return;
    }
    void logMfaEvent("mfa_verified", { factorId });
    // Hard navigation (not router.replace) so /admin re-renders against the
    // freshly-written aal2 cookie rather than a soft-nav cache. Keep the
    // spinner on through the redirect — no flash.
    window.location.href = "/admin";
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="h-5 w-5 text-[color:var(--brand-gold)]" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Two-factor verification
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Open your authenticator app and enter the 6-digit code for
        StrataWise to finish signing in.
      </p>

      <Card>
        <CardContent className="space-y-4 pt-5">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !factorId ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              No verified authenticator was found on your account. Contact
              StrataWise support to reset MFA.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code">
                  Authenticator code{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  autoComplete="one-time-code"
                  autoFocus
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
                Verify
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
