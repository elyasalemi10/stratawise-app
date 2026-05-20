import { getOC, getLotsWithFinancials } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LotsPageContent } from "./lots-page-content";
import { getLotInvitationStatus } from "../manage/invitation-actions";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function LotsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const [oc, lots, profile] = await Promise.all([
    getOC(ocId),
    getLotsWithFinancials(ocId),
    getCurrentProfile(),
  ]);

  if (!oc) redirect("/dashboard");

  // Preload invitation status server-side so the lots tab doesn't have
  // to spinner-fetch on mount. The status map is a flat Map<lotId,
  // statusKey> ('not_invited' | 'pending' | 'accepted' | ...). Empty
  // when there are no lots yet.
  const initialInviteStatus =
    lots.length > 0
      ? await getLotInvitationStatus(ocId, lots.map((l) => l.id))
      : ({} as Record<string, string>);

  // Normalise Map / record into a plain record so it serialises cleanly
  // across the server → client boundary.
  const inviteStatusObj: Record<string, string> = {};
  if (initialInviteStatus instanceof Map) {
    initialInviteStatus.forEach((v, k) => {
      inviteStatusObj[k] = v;
    });
  } else if (initialInviteStatus && typeof initialInviteStatus === "object") {
    for (const [k, v] of Object.entries(initialInviteStatus)) {
      inviteStatusObj[k] = String(v);
    }
  }

  return (
    <LotsPageContent
      lots={lots}
      ocId={ocId}
      ocName={oc.name}
      isLotOwner={profile?.role === "lot_owner"}
      initialInviteStatus={inviteStatusObj}
    />
  );
}
