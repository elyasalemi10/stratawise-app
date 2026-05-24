"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWaitlist } from "@/lib/actions/waitlist";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailInvalid(true);
      toast.error("Enter a valid email address.");
      return;
    }
    setEmailInvalid(false);

    startTransition(async () => {
      const result = await joinWaitlist({
        email: trimmedEmail,
        name: name.trim(),
        company: company.trim(),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setSubmitted(true);
      if (result.alreadyOnList) {
        toast.success("You're already on the list , we'll be in touch soon.");
      } else {
        toast.success("You're on the list. We'll be in touch.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-white/15 bg-white/5 px-6 py-8 text-center">
        <h2 className="text-xl font-semibold text-white">You&apos;re on the list.</h2>
        <p className="mt-2 text-sm text-white/70">
          Thanks for your interest. We&apos;ll email <span className="text-white">{email}</span> when StrataWise opens up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="waitlist-name" className="text-white/80">
            Name <span className="text-white/40 font-normal">(optional)</span>
          </Label>
          <Input
            id="waitlist-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-white/40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="waitlist-company" className="text-white/80">
            Company <span className="text-white/40 font-normal">(optional)</span>
          </Label>
          <Input
            id="waitlist-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            autoComplete="organization"
            className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-white/40"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="waitlist-email" className="text-white/80">
          Email
        </Label>
        <Input
          id="waitlist-email"
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
          className="h-11 border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:border-white/40 aria-invalid:border-red-400 aria-invalid:ring-red-400/30"
        />
      </div>

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full border border-white/20 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {isPending && <Loader2 className="size-4 animate-spin" />}
        Join the waitlist
      </Button>
    </form>
  );
}
