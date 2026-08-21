"use server";

import { getOC, getLotsWithFinancials, type LotWithFinancials } from "@/lib/actions/oc";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { getLotInvitationStatus } from "../manage/invitation-actions";

// One aggregate fetch per page, called from the client through
// useCachedData. Everything the lots register needs, in a single round trip,
// so the hook has exactly one thing to cache under `lots:${ocId}`.
//
// Auth lives HERE, not in page.tsx. When the client owns the fetching the
// page component is only a shell, so a check that stayed up there would be
// skipped on every refresh after the first. requireOCAccess throws, which
// the hook reports as an error rather than blanking the page.

export interface LotsPageData {
  lots: LotWithFinancials[];
  ocName: string;
  isLotOwner: boolean;
  inviteStatus: Record<string, string>;
}

export async function getLotsPageData(ocId: string): Promise<LotsPageData> {
  await requireOCAccess(ocId);

  const [oc, lots, profile] = await Promise.all([
    getOC(ocId),
    getLotsWithFinancials(ocId),
    getCurrentProfile(),
  ]);
  if (!oc) throw new Error("This Owners Corporation is no longer available.");

  // Invitation status is a second query keyed off the lots we just read, so
  // it can't join the Promise.all above.
  const raw =
    lots.length > 0
      ? await getLotInvitationStatus(ocId, lots.map((l) => l.id))
      : ({} as Record<string, string>);

  const inviteStatus: Record<string, string> = {};
  if (raw instanceof Map) {
    raw.forEach((v, k) => {
      inviteStatus[k] = String(v);
    });
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) inviteStatus[k] = String(v);
  }

  return {
    lots,
    ocName: oc.name,
    isLotOwner: profile?.role === "lot_owner",
    inviteStatus,
  };
}
