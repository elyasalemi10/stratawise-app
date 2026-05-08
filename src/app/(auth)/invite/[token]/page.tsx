import { getInvitationByToken } from "@/lib/actions/invitations";
import { InviteAcceptContent } from "./invite-accept-content";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <h1 className="text-xl font-semibold text-foreground">Invitation not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invitation link is invalid. Please check the link or ask your strata manager for a new one.
        </p>
      </div>
    );
  }

  return <InviteAcceptContent invitation={invitation} />;
}
