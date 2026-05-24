"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// Manager transfer , closes the active management_agreement and opens a
// new one for the chosen agency. Levies, audit_log, and historical
// records stay attributed to the outgoing manager because the
// management_agreements table is time-bound (end_date != null on the
// closed row).

export interface ManagementCompanyOption {
  id: string;
  name: string;
  trading_as: string | null;
}

/**
 * List every management_company in the system. Used by the transfer
 * dialog's picker. We deliberately surface name + trading_as (not the
 * operating-account details) , a transfer needs the agency identity
 * only. Excludes the current manager since transferring to self is a
 * no-op.
 */
export async function listManagementCompanies(
  currentCompanyId: string,
): Promise<ManagementCompanyOption[]> {
  await requireCompanyRole();
  const supabase = createServerClient();
  const { data } = await supabase
    .from("management_companies")
    .select("id, name, trading_as")
    .neq("id", currentCompanyId)
    .order("name", { ascending: true });
  return (data ?? []) as ManagementCompanyOption[];
}

export interface TransferOCInput {
  ocId: string;
  newManagementCompanyId: string;
  transferDate: string; // ISO yyyy-mm-dd
  notes?: string;
}

export async function transferOCManagement(input: TransferOCInput): Promise<
  | { success: true; oldAgreementId: string | null; newAgreementId: string }
  | { error: string }
> {
  const profile = await requireCompanyRole();
  await requireOCAccess(input.ocId);

  // Sanity: transfer date must be a valid ISO date.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transferDate)) {
    return { error: "Transfer date must be in YYYY-MM-DD format." };
  }
  if (!input.newManagementCompanyId) {
    return { error: "Pick a management agency to transfer to." };
  }

  const supabase = createServerClient();

  // Verify the new agency exists.
  const { data: target } = await supabase
    .from("management_companies")
    .select("id, name")
    .eq("id", input.newManagementCompanyId)
    .maybeSingle();
  if (!target) return { error: "Target management agency not found." };

  // Snapshot the current OC + active agreement before mutating, for
  // audit_log before_state.
  const { data: oc } = await supabase
    .from("owners_corporations")
    .select("id, management_company_id")
    .eq("id", input.ocId)
    .maybeSingle();
  if (!oc) return { error: "OC not found." };
  if (oc.management_company_id === input.newManagementCompanyId) {
    return { error: "This OC is already managed by that agency." };
  }

  const { data: activeAgreement } = await supabase
    .from("management_agreements")
    .select("id, management_company_id, start_date")
    .eq("oc_id", input.ocId)
    .is("end_date", null)
    .maybeSingle();

  // 1. Close the active agreement (if any). New row's start_date must
  //    be on/after the old row's start_date , enforced in the schema.
  let oldAgreementId: string | null = null;
  if (activeAgreement) {
    if (activeAgreement.start_date && input.transferDate < activeAgreement.start_date) {
      return { error: `Transfer date is before the current agreement's start (${activeAgreement.start_date}).` };
    }
    const { error: closeErr } = await supabase
      .from("management_agreements")
      .update({ end_date: input.transferDate })
      .eq("id", activeAgreement.id);
    if (closeErr) {
      return { error: `Could not close the existing agreement: ${closeErr.message}` };
    }
    oldAgreementId = activeAgreement.id;
  }

  // 2. Open the new agreement.
  const { data: newAgreement, error: openErr } = await supabase
    .from("management_agreements")
    .insert({
      oc_id: input.ocId,
      management_company_id: input.newManagementCompanyId,
      start_date: input.transferDate,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (openErr || !newAgreement) {
    // Roll back the close-edit so we don't leave the OC with no active
    // agreement on a failure.
    if (oldAgreementId) {
      await supabase
        .from("management_agreements")
        .update({ end_date: null })
        .eq("id", oldAgreementId);
    }
    return { error: `Could not open the new agreement: ${openErr?.message ?? "unknown"}` };
  }

  // 3. Update the legacy pointer on owners_corporations so existing
  //    readers (RLS, sidebar OC list, etc.) see the new manager.
  const { error: ptrErr } = await supabase
    .from("owners_corporations")
    .update({ management_company_id: input.newManagementCompanyId })
    .eq("id", input.ocId);
  if (ptrErr) {
    console.error("transferOCManagement: legacy pointer update failed", ptrErr);
    // Non-fatal , the agreements table is the source of truth going
    // forward, and the next sidebar / RLS refresh will pick this up.
  }

  // 4. Audit.
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: input.ocId,
    action: "manager_transfer",
    entity_type: "oc",
    entity_id: input.ocId,
    before_state: {
      management_company_id: oc.management_company_id,
      management_agreement_id: activeAgreement?.id ?? null,
    },
    after_state: {
      management_company_id: input.newManagementCompanyId,
      management_agreement_id: newAgreement.id,
      transfer_date: input.transferDate,
    },
    metadata: {
      target_name: target.name,
      notes: input.notes ?? null,
    },
  });

  revalidatePath(`/ocs/[ocCode]/settings`, "page");
  revalidatePath(`/ocs`, "page");

  return {
    success: true,
    oldAgreementId,
    newAgreementId: newAgreement.id,
  };
}

export interface ActiveAgreement {
  id: string;
  start_date: string;
  manager_name: string;
  manager_trading_as: string | null;
}

export async function getActiveManagementAgreement(
  ocId: string,
): Promise<ActiveAgreement | null> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("management_agreements")
    .select("id, start_date, management_companies!inner(name, trading_as)")
    .eq("oc_id", ocId)
    .is("end_date", null)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mc = (data as any).management_companies;
  return {
    id: data.id,
    start_date: data.start_date,
    manager_name: mc?.name ?? "Unknown agency",
    manager_trading_as: mc?.trading_as ?? null,
  };
}
