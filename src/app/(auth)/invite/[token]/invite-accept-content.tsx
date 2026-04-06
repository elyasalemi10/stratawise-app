"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, MapPin, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/lib/actions/invitations";

interface InviteAcceptContentProps {
  invitation: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    isExpired: boolean;
    subdivision: { id: string; name: string; address: string; plan_number: string } | null;
    lot: { lot_number: number; unit_number: string | null } | null;
  };
  token: string;
  isLoggedIn: boolean;
}

export function InviteAcceptContent({ invitation, token, isLoggedIn }: InviteAcceptContentProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  // Expired
  if (invitation.isExpired && invitation.status === "pending") {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <Clock className="h-12 w-12 text-muted-foreground/30 mx-auto" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Invitation expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation has expired. Ask your strata manager for a new one.
        </p>
      </div>
    );
  }

  // Already accepted
  if (invitation.status === "accepted") {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <CheckCircle2 className="h-12 w-12 text-[hsl(160,100%,37%)] mx-auto" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Already accepted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation has already been accepted.
        </p>
        <Link href="/dashboard">
          <Button className="mt-4">Go to dashboard</Button>
        </Link>
      </div>
    );
  }

  // Revoked
  if (invitation.status === "revoked") {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <AlertCircle className="h-12 w-12 text-destructive/50 mx-auto" />
        <h1 className="mt-4 text-xl font-semibold text-foreground">Invitation revoked</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation has been revoked. Contact your strata manager.
        </p>
      </div>
    );
  }

  async function handleAccept() {
    setPending(true);
    const result = await acceptInvitation(token);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Invitation accepted");

    if (result.subdivisionId) {
      router.push(`/subdivisions/${result.subdivisionId}/dashboard`);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          You&apos;ve been invited
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {invitation.name ? `Hi ${invitation.name}, you` : "You"}&apos;ve been invited to join {invitation.subdivision?.name ?? "a subdivision"}.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          {invitation.subdivision && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {invitation.subdivision.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {invitation.subdivision.address}
                </span>
              </div>
            </div>
          )}

          {invitation.lot && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Lot:</span>
              <span className="text-sm font-medium text-foreground">
                Lot {invitation.lot.lot_number}
                {invitation.lot.unit_number ? ` (Unit ${invitation.lot.unit_number})` : ""}
              </span>
            </div>
          )}

        </CardContent>
      </Card>

      <div className="mt-6">
        {isLoggedIn ? (
          <Button className="w-full" onClick={handleAccept} disabled={pending}>
            {pending ? "Accepting..." : "Accept invitation"}
          </Button>
        ) : (
          <Link href={`/sign-up?role=lot_owner&invite=${token}`}>
            <Button className="w-full">Sign up to accept</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
