import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
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
  getActiveDrnsForLot,
  getPortalActivity,
  hasAnyLevyEverBeenIssued,
} from "@/lib/actions/lot-overview";
import { listLotCommunications } from "@/lib/actions/lot-communications";
import { getLotEngagement } from "@/lib/actions/lot-engagement";
import { LotDetailContent } from "./lot-detail-content";
import type { DocumentRecord } from "@/lib/validations/documents";

import { resolveOCFromCode } from "@/lib/oc-resolver";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ ocCode: string; lotId: string }>;
}) {
  const { ocCode, lotId } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;
  const profile = await getCurrentProfile();

  // Lot owners cannot view other lot owners' detail pages
  if (profile?.role === "lot_owner") {
    redirect(`/ocs/${ocCode}/lots`);
  }

  const supabase = createServerClient();

  const [{ data: lot }, { data: oc }] = await Promise.all([
    supabase
      .from("lots")
      .select("*")
      .eq("id", lotId)
      .eq("oc_id", ocId)
      .single(),
    supabase
      .from("owners_corporations")
      .select("address, bank_provider")
      .eq("id", ocId)
      .single(),
  ]);

  if (!lot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-base font-medium text-foreground">Lot not found</p>
      </div>
    );
  }

  // Pull balance from the materialised lot_ledger_state row. That row is
  // the single source of truth — opening balances, levies, payments,
  // interest accrual, voids, and adjustments all flow into it via the
  // lot_ledger_entries trigger pipeline. The previous code summed
  // levy_notices and payments directly, which missed opening balances
  // (and double-counted nothing — payments still showed up but the seed
  // entries didn't).
  //
  // Sign convention: lot_ledger_state stores `total_balance = credits −
  // debits`. The UI convention is the inverse (positive = owes), so we
  // flip the sign here once and the rest of the page consumes the
  // familiar "+owes / −credit" semantic.
  const [stateResult, documentsResult] = await Promise.all([
    supabase
      .from("lot_ledger_state")
      .select("total_balance")
      .eq("lot_id", lotId)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("*")
      .eq("oc_id", ocId)
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false }),
  ]);

  // No state row yet (e.g. brand-new lot, never had a single entry) →
  // treat as zero. The recompute trigger seeds the row on the first
  // entry insertion.
  const ledgerTotal = stateResult.data
    ? Number((stateResult.data as { total_balance: number | string }).total_balance) || 0
    : 0;
  const balance = -ledgerTotal;

  const documents = (documentsResult.data as DocumentRecord[]) ?? [];

  // Pull the current lot_owners row for the header chip (payment_reference,
  // owner_type, occupancy) and Tenancy tab (tenant_*, digital consent).
  // We don't migrate this read to the new owners table yet — the entity
  // model only carries the universal fields (name/email/phone), not the
  // per-lot bits (postal occupancy + tenant + consent), which still live
  // on lot_owners.
  const lotOwnerResult = await supabase
    .from("lot_owners")
    .select(
      "id, owner_type, payment_reference, is_occupied_by_owner, occupancy_status, ownership_since, tenant_name, tenant_email, tenant_phone, digital_consent_categories, at_portal_signup_categories, postal_address",
    )
    .eq("lot_id", lotId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lotOwnerExtra = lotOwnerResult.data;

  // Most recent payment timestamp for the "Last payment" header line.
  // payments uses payment_date (not paid_at) — the latter is a levy_notices
  // column. Picking the wrong one made the page server-render fail.
  const { data: lastPaymentRow } = await supabase
    .from("payments")
    .select("payment_date, amount")
    .eq("lot_id", lotId)
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    owner,
    ownershipHistory,
    nextLevy,
    anyLevyEver,
    activity,
    drns,
    portalActivity,
    communications,
    engagement,
    managerSendAddressResult,
    smsSenderResult,
  ] = await Promise.all([
    getLotOwner(supabase, lotId),
    getLotOwnershipHistory(lotId),
    getNextLevyDue(lotId),
    hasAnyLevyEverBeenIssued(lotId),
    getLotActivity(lotId, 50),
    getActiveDrnsForLot(lotId),
    getPortalActivity(lotId),
    listLotCommunications(lotId),
    getLotEngagement(lotId),
    // Preload comms metadata so the Send-email + Send-SMS drawers paint
    // with the right "From" address on first frame instead of running a
    // client-side fetch every time they open.
    getManagerSendAddress().catch(() => ({ address: null as string | null })),
    getSmsSenderId().catch(() => ({ sender: null as string | null })),
  ]);
  const senderEmailAddress =
    (managerSendAddressResult as { address?: string | null })?.address ?? null;
  const smsSenderId =
    (smsSenderResult as { sender?: string | null })?.sender ?? null;

  return (
    <LotDetailContent
      lot={lot}
      owner={owner}
      ocId={ocId}
      balance={balance}
      documents={documents}
      ownershipHistory={ownershipHistory}
      lotOwnerExtra={
        lotOwnerExtra
          ? {
              lot_owner_id: lotOwnerExtra.id ?? null,
              owner_type: lotOwnerExtra.owner_type ?? null,
              payment_reference: lotOwnerExtra.payment_reference ?? null,
              is_occupied_by_owner: lotOwnerExtra.is_occupied_by_owner ?? null,
              occupancy_status: (lotOwnerExtra.occupancy_status as
                | "owner_occupied"
                | "tenanted"
                | "vacant"
                | null) ?? null,
              ownership_since: (lotOwnerExtra.ownership_since as string | null) ?? null,
              tenant_name: lotOwnerExtra.tenant_name ?? null,
              tenant_email: lotOwnerExtra.tenant_email ?? null,
              tenant_phone: lotOwnerExtra.tenant_phone ?? null,
              digital_consent_categories: (lotOwnerExtra.digital_consent_categories as string[] | null) ?? [],
              at_portal_signup_categories: (lotOwnerExtra.at_portal_signup_categories as string[] | null) ?? [],
              postal_address: lotOwnerExtra.postal_address ?? null,
            }
          : null
      }
      lastPaymentAt={lastPaymentRow?.payment_date ?? null}
      nextLevy={nextLevy}
      anyLevyEverIssued={anyLevyEver}
      lotAddress={
        oc?.address
          ? `${lot.unit_number ? `Unit ${lot.unit_number} / ` : ""}${oc.address}`
          : null
      }
      activity={activity}
      drns={drns}
      portalActivity={portalActivity}
      communications={communications}
      engagement={engagement}
      bankProvider={(oc as { bank_provider?: string } | null)?.bank_provider ?? null}
      initialSenderEmailAddress={senderEmailAddress}
      initialSmsSenderId={smsSenderId}
    />
  );
}
