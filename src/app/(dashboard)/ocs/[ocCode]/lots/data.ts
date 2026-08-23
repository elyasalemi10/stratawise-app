"use server";

import { getOC, getLotsWithFinancials, type LotWithFinancials } from "@/lib/actions/oc";
import { getCurrentProfile } from "@/lib/auth";
import { getLotInvitationStatusByOc } from "../manage/invitation-actions";

// One aggregate fetch per page, called from the client through useCachedData,
// so the hook has exactly one thing to cache under `lots:${ocId}`.
//
// Auth lives HERE, not in page.tsx. When the client owns the fetching the
// page component is only a shell, so a check that stayed up there would be
// skipped on every refresh after the first. getLotsWithFinancials calls
// requireOCAccess, which throws on denial, and the hook reports that as an
// error rather than blanking the page.
//
// EVERYTHING GOES IN ONE Promise.all. The refresh bar is visible for exactly
// as long as this function takes, so every avoidable sequential round trip is
// a longer gold line. Invitation status used to run afterwards because it was
// keyed off the lot ids this function had just read; getLotInvitationStatusByOc
// scopes by oc_id instead, which removes that dependency entirely.

export interface LotsPageData {
  lots: LotWithFinancials[];
  ocName: string;
  isLotOwner: boolean;
  inviteStatus: Record<string, string>;
}

export async function getLotsPageData(ocId: string): Promise<LotsPageData> {
  const [oc, lots, profile, inviteMap] = await Promise.all([
    getOC(ocId),
    getLotsWithFinancials(ocId),
    getCurrentProfile(),
    getLotInvitationStatusByOc(ocId),
  ]);
  if (!oc) throw new Error("This Owners Corporation is no longer available.");

  // The map is oc-wide, so narrow it to the lots actually on screen. Cheap in
  // memory and keeps the payload the hook caches to what the page renders.
  const inviteStatus: Record<string, string> = {};
  for (const lot of lots) {
    const status = inviteMap.get(lot.id);
    if (status) inviteStatus[lot.id] = status;
  }

  return {
    lots,
    ocName: oc.name,
    isLotOwner: profile?.role === "lot_owner",
    inviteStatus,
  };
}
