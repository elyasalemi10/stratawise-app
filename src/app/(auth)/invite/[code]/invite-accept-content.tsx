"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Building2, MapPin, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/lib/actions/invitations";
import { getSupabaseClient } from "@/lib/supabase";

// The invitation landing page.
//
// It used to say "Thank you, your invitation has been received" and do
// nothing at all: no account, no membership, no access. The owner had been
// emailed a link that led to a dead end, and the manager's list still said
// they had not accepted , because they had not, and could not.
//
// Now it does the three things it was pretending to:
//   - signed in  → Accept, which links the profile to the ownership
//   - signed out → send them to sign-up (or sign-in) with the invite email
//                  carried across, and bring them straight back here after
//   - already accepted / expired / revoked → say so, and what to do next

interface InviteAcceptContentProps {
  code: string;
  invitation: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    isExpired: boolean;
    oc: { id: string; name: string; address: string; plan_number: string } | null;
    lot: { lot_number: number; unit_number: string | null } | null;
  };
}

export function InviteAcceptContent({ code, invitation }: InviteAcceptContentProps) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    getSupabaseClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const lotLabel = invitation.lot
    ? `Lot ${invitation.lot.lot_number}${invitation.lot.unit_number ? ` · Unit ${invitation.lot.unit_number}` : ""}`
    : null;

  const dead =
    invitation.status === "accepted"
      ? "This invitation has already been accepted. Sign in to see your lot."
      : invitation.status === "revoked"
        ? "This invitation was withdrawn. Ask your strata manager for a new one."
        : invitation.isExpired
          ? "This invitation has expired. Ask your strata manager to send another."
          : null;

  async function accept() {
    setAccepting(true);
    const result = await acceptInvitation(code);
    if ("error" in result && result.error) {
      setAccepting(false);
      toast.error(result.error);
      return;
    }
    // Spinner stays on through the navigation.
    router.push(("ocUrl" in result && result.ocUrl) || "/dashboard");
  }

  const nextUrl = `/invite/${code}`;

  return (
    <div className="w-full space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {invitation.name ? `Hi ${invitation.name},` : "You've been invited"}
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">
          {dead ?? "You've been invited to manage your lot on StrataWise."}
        </p>
      </div>

      {/* What they are being given access to. Sections and rules rather than
          a card , this is the whole page, not a widget on one. */}
      <div className="mx-auto w-full max-w-sm divide-y divide-border rounded-lg border border-border">
        {invitation.oc && (
          <>
            <Row icon={<Building2 className="size-4" />} label="Owners Corporation">
              {invitation.oc.name}
            </Row>
            <Row icon={<MapPin className="size-4" />} label="Address">
              {invitation.oc.address}
            </Row>
          </>
        )}
        {lotLabel && (
          <Row icon={<Home className="size-4" />} label="Your lot">{lotLabel}</Row>
        )}
      </div>

      {!dead && (
        <div className="mx-auto w-full max-w-sm space-y-3">
          {signedIn === null ? (
            <Button className="h-11 w-full" disabled loading>
              Accept invitation
            </Button>
          ) : signedIn ? (
            <Button
              className="h-11 w-full"
              onClick={accept}
              disabled={accepting}
              loading={accepting}
            >
              Accept invitation
            </Button>
          ) : (
            <>
              <Link
                href={`/sign-up?next=${encodeURIComponent(nextUrl)}&email=${encodeURIComponent(invitation.email)}&role=lot_owner`}
                className="block"
              >
                <Button className="h-11 w-full">Create your account</Button>
              </Link>
              <p className="text-center text-sm text-muted-foreground">
                Already have one?{" "}
                <Link
                  href={`/sign-in?next=${encodeURIComponent(nextUrl)}`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      )}

      {dead && (
        <div className="mx-auto w-full max-w-sm">
          <Link href="/sign-in" className="block">
            <Button className="h-11 w-full">Sign in</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{children}</p>
      </div>
    </div>
  );
}
