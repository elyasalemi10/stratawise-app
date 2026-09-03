"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, requestEmailChange } from "./actions";

// Email and password changes both live behind the current password.
//
// These two fields are the account's recovery route. Everything else on the
// profile page saves on blur, because the cost of a mistake is retyping your
// surname; changing either of these behind an unlocked laptop is how someone
// loses an account, so both re-authenticate first.
//
// Validation follows the house rule: collect every problem, flag each field,
// one toast, and only on submit.

export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentEmail: string;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [invalid, setInvalid] = React.useState({ email: false, password: false });
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setInvalid({ email: false, password: false });
    }
  }, [open]);

  async function submit() {
    const problems: string[] = [];
    const next = { email: false, password: false };
    if (!email.trim()) { problems.push("Enter the new email address."); next.email = true; }
    if (!password) { problems.push("Enter your current password."); next.password = true; }
    if (problems.length) {
      setInvalid(next);
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const res = await requestEmailChange(password, email);
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    // The address does not change until the link is clicked, so say that
    // rather than "Email updated", which would be a lie.
    toast.success(`Confirm the change from the link sent to ${res.pendingEmail}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription>
            We&apos;ll send a confirmation link to the new address. Your email stays
            {" "}{currentEmail} until you click it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">New email <span className="text-destructive">*</span></Label>
            <Input
              id="new-email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setInvalid((p) => ({ ...p, email: false })); }}
              aria-invalid={invalid.email || undefined}
              placeholder="New email address"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-current-password">
              Current password <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email-current-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setInvalid((p) => ({ ...p, password: false })); }}
              aria-invalid={invalid.password || undefined}
              placeholder="Current password"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>Send confirmation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [invalid, setInvalid] = React.useState({ current: false, next: false, confirm: false });
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCurrent(""); setNext(""); setConfirm("");
      setInvalid({ current: false, next: false, confirm: false });
    }
  }, [open]);

  async function submit() {
    const problems: string[] = [];
    const flags = { current: false, next: false, confirm: false };
    if (!current) { problems.push("Enter your current password."); flags.current = true; }
    if (next.length < 8) { problems.push("New password must be at least 8 characters."); flags.next = true; }
    if (confirm !== next) { problems.push("The passwords don't match."); flags.confirm = true; }
    if (problems.length) {
      setInvalid(flags);
      toast.error(problems.length === 1 ? problems[0] : "Fix the highlighted fields.");
      return;
    }

    setPending(true);
    const res = await changePassword(current, next);
    setPending(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Password changed");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            You&apos;ll stay signed in on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {([
            ["current-password", "Current password", current, setCurrent, "current"],
            ["new-password", "New password", next, setNext, "next"],
            ["confirm-password", "Confirm new password", confirm, setConfirm, "confirm"],
          ] as const).map(([id, label, value, setter, key]) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={id}>{label} <span className="text-destructive">*</span></Label>
              <Input
                id={id}
                type="password"
                value={value}
                onChange={(e) => {
                  setter(e.target.value);
                  setInvalid((p) => ({ ...p, [key]: false }));
                }}
                aria-invalid={invalid[key] || undefined}
                placeholder={label}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>Change password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
