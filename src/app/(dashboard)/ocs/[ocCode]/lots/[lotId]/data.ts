"use server";

import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getLotOwner } from "@/lib/actions/lot-ownership";
import { getLotOwnershipHistory } from "@/lib/actions/settlements";
import {
  getManagerSendAddress,
  getSmsSenderId,
} from "@/lib/actions/manager-username";
import {
  getNextLevyDue,
  getLotActivity,
  getPortalActivity,
  hasAnyLevyEverBeenIssued,
} from "@/lib/actions/lot-overview";
import { listLotCommunications } from "@/lib/actions/lot-communications";
import { getLotEngagement } from "@/lib/actions/lot-engagement";
import type { DocumentRecord } from "@/lib/validations/documents";

// One aggregate fetch for the lot detail page.
//
// This used to run as FIVE sequential waves: lot+OC, then
// levies/payments/documents/sibling-lots, then the lot_owners row, then the
// last payment, then an eleven-way Promise.all. Nothing after the first wave
// actually depended on the first wave's result , every one of those queries
// keys off lotId or ocId, both known before a single query goes out. At
// roughly 55ms a round trip that was about 220ms of the page spent waiting on
// itself. It is one wave now.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

export interface LotOwnerExtra {
  lot_owner_id: string | null;
  payment_reference: string | null;
  ownership_since: string | null;
  postal_address: string | null;
}

export interface LotDetailPageData {
  /** null when the lot id does not belong to this OC. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lot: any | null;
  owner: Awaited<ReturnType<typeof getLotOwner>>;
  balance: number;
  documents: DocumentRecord[];
  ownershipHistory: Awaited<ReturnType<typeof getLotOwnershipHistory>>;
  lotOwnerExtra: LotOwnerExtra | null;
  lastPaymentAt: string | null;
  nextLevy: Awaited<ReturnType<typeof getNextLevyDue>>;
  anyLevyEverIssued: boolean;
  lotAddress: string | null;
  activity: Awaited<ReturnType<typeof getLotActivity>>;
  portalActivity: Awaited<ReturnType<typeof getPortalActivity>>;
  communications: Awaited<ReturnType<typeof listLotCommunications>>;
  engagement: Awaited<ReturnType<typeof getLotEngagement>>;
  initialSenderEmailAddress: string | null;
  initialSmsSenderId: string | null;
  ocLots: Array<{ id: string; lotNumber: number; unitNumber: string | null }>;
}

export async function getLotDetailPageData(
  ocId: string,
  lotId: string,
): Promise<LotDetailPageData> {
  const profile = await requireOCAccess(ocId);
  // Lot owners cannot view other lot owners' detail pages.
  if (profile.role === "lot_owner") throw new Error("Access denied.");

  const supabase = createServerClient();

  const [
    { data: lot },
    { data: oc },
    leviesResult,
    paymentsResult,
    documentsResult,
    ocLotsResult,
    lotOwnerResult,
    { data: lastPaymentRow },
    owner,
    ownershipHistory,
    nextLevy,
    anyLevyEver,
    activity,
    portalActivity,
    communications,
    engagement,
    managerSendAddressResult,
    smsSenderResult,
  ] = await Promise.all([
    supabase.from("lots").select("*").eq("id", lotId).eq("oc_id", ocId).single(),
    supabase
      .from("owners_corporations")
      .select("address")
      .eq("id", ocId)
      .single(),
    supabase
      .from("levy_notices")
      .select("amount")
      .eq("lot_id", lotId)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase.from("payments").select("amount").eq("lot_id", lotId),
    supabase
      .from("documents")
      .select("*")
      .eq("oc_id", ocId)
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false }),
    // Sibling lots for the settlement drawer's "which lot?" selector.
    supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .eq("oc_id", ocId)
      .order("lot_number", { ascending: true }),
    // The current ownership backs the header chip (payment reference,
    // service address, ownership start).
    supabase
      .from("v_lot_current_owners")
      .select(
        "id, payment_reference, ownership_since, postal_address",
      )
      .eq("lot_id", lotId)
      .maybeSingle(),
    // Most recent payment for the "Last payment" header line. payments uses
    // payment_date, not paid_at (that is a levy_notices column).
    supabase
      .from("payments")
      .select("payment_date, amount")
      .eq("lot_id", lotId)
      .order("payment_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getLotOwner(supabase, lotId),
    getLotOwnershipHistory(lotId),
    getNextLevyDue(lotId),
    hasAnyLevyEverBeenIssued(lotId),
    getLotActivity(lotId, 50),
    getPortalActivity(lotId),
    listLotCommunications(lotId),
    getLotEngagement(lotId),
    // Preload comms metadata so the Send-email + Send-SMS drawers paint with
    // the right "From" address on first frame instead of fetching on open.
    getManagerSendAddress().catch(() => ({ address: null as string | null })),
    getSmsSenderId().catch(() => ({ sender: null as string | null })),
  ]);

  if (!lot) {
    return {
      lot: null,
      owner: null,
      balance: 0,
      documents: [],
      ownershipHistory: [],
      lotOwnerExtra: null,
      lastPaymentAt: null,
      nextLevy: null,
      anyLevyEverIssued: false,
      lotAddress: null,
      activity: [],
      portalActivity: [],
      communications: [],
      engagement: null,
      bankProvider: null,
      initialSenderEmailAddress: null,
      initialSmsSenderId: null,
      ocLots: [],
    } as unknown as LotDetailPageData;
  }

  // Balance = lot opening balance (set at OC creation) + outstanding levy
  // notices , payments. opening_balance sign convention is owes-positive,
  // which is what the UI expects directly , no flip.
  const opening = Number(
    (lot as { opening_balance?: number | string | null }).opening_balance ?? 0,
  );
  const totalLevied = (leviesResult.data ?? []).reduce(
    (s, r) => s + Number((r as { amount: number | string }).amount),
    0,
  );
  const totalPaid = (paymentsResult.data ?? []).reduce(
    (s, r) => s + Number((r as { amount: number | string }).amount),
    0,
  );

  const e = lotOwnerResult.data;

  return {
    lot,
    owner,
    balance: opening + totalLevied - totalPaid,
    documents: (documentsResult.data as DocumentRecord[]) ?? [],
    ownershipHistory,
    lotOwnerExtra: e
      ? {
          lot_owner_id: e.id ?? null,
          payment_reference: e.payment_reference ?? null,
          ownership_since: (e.ownership_since as string | null) ?? null,
          postal_address: e.postal_address ?? null,
        }
      : null,
    lastPaymentAt: lastPaymentRow?.payment_date ?? null,
    nextLevy,
    anyLevyEverIssued: anyLevyEver,
    lotAddress: oc?.address
      ? `${lot.unit_number ? `Unit ${lot.unit_number} / ` : ""}${oc.address}`
      : null,
    activity,
    portalActivity,
    communications,
    engagement,
    initialSenderEmailAddress:
      (managerSendAddressResult as { address?: string | null })?.address ?? null,
    initialSmsSenderId: (smsSenderResult as { sender?: string | null })?.sender ?? null,
    ocLots: (
      (ocLotsResult.data as
        | { id: string; lot_number: number; unit_number: string | null }[]
        | null) ?? []
    ).map((l) => ({
      id: l.id,
      lotNumber: Number(l.lot_number),
      unitNumber: l.unit_number,
    })),
  };
}
