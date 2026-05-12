"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pwInvalid, setPwInvalid] = useState(false);
  const [confirmInvalid, setConfirmInvalid] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!PASSWORD_RULE.test(password)) {
      setPwInvalid(true);
      toast.error("Password too weak. 8+ characters, one letter, one special symbol.");
      return;
    }
    if (password !== confirm) {
      setConfirmInvalid(true);
      toast.error("Passwords don't match");
      return;
    }

    setPending(true);
    setPwInvalid(false);
    setConfirmInvalid(false);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPending(false);
      setPwInvalid(true);
      toast.error(error.message);
      return;
    }

    // Sign out to force a fresh sign-in with the new password
    await supabase.auth.signOut();
    window.location.href = "/sign-in";
  }

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Set a new password
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Choose a password you haven&apos;t used before.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
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
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
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
          Update password
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
