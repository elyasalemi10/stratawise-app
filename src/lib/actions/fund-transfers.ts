"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { revalidateSidebarForOC } from "./oc";
import {
  fundTransferSchema,
  type FundTransferInput,
  type FundTransferRecord,
} from "@/lib/validations/fund-transfers";

// ─── createFundTransfer ─────────────────────────────────────────
// Moves money between two of an OC's fund accounts. The RPC writes both
// bank-transaction legs + the transfer row atomically and enforces that the
// source fund holds enough to cover it (a trust fund must not go negative).
export async function createFundTransfer(
  input: FundTransferInput,
): Promise<{ transferId?: string; error?: string }> {
  const parsed = fundTransferSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const profile = await requireCompanyRole(["admin", "manager"]);
  await requireOCAccess(parsed.data.oc_id);
  const supabase = createServerClient();

  // Both legs must be accounts of THIS OC, so a valid OC id can't be paired
  // with another OC's bank account to misattribute the transfer.
  const { data: accts } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("oc_id", parsed.data.oc_id)
    .in("id", [parsed.data.from_bank_account_id, parsed.data.to_bank_account_id]);
  const okIds = new Set((accts ?? []).map((a) => a.id as string));
  if (
    !okIds.has(parsed.data.from_bank_account_id) ||
    !okIds.has(parsed.data.to_bank_account_id)
  ) {
    return { error: "That bank account doesn't belong to this owners corporation." };
  }

  const { data, error } = await supabase.rpc("rpc_create_fund_transfer", {
    p_oc_id: parsed.data.oc_id,
    p_from_bank_account_id: parsed.data.from_bank_account_id,
    p_to_bank_account_id: parsed.data.to_bank_account_id,
    p_amount: parsed.data.amount,
    p_transfer_date: parsed.data.transfer_date,
    p_reason: parsed.data.reason ?? null,
    p_created_by: profile.id,
  });

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: parsed.data.oc_id,
    action: "fund_transfer.created",
    entity_type: "fund_transfer",
    entity_id: data as string,
    after_state: {
      from_bank_account_id: parsed.data.from_bank_account_id,
      to_bank_account_id: parsed.data.to_bank_account_id,
      amount: parsed.data.amount,
      transfer_date: parsed.data.transfer_date,
      reason: parsed.data.reason ?? null,
    },
  });

  await revalidateSidebarForOC(parsed.data.oc_id);
  revalidatePath("/ocs/[ocCode]/bank-account", "page");
  revalidatePath("/ocs/[ocCode]/reconciliation", "page");
  return { transferId: data as string };
}

// ─── getFundTransfers ───────────────────────────────────────────
// Recent inter-fund transfers for an OC, newest first.
export async function getFundTransfers(
  ocId: string,
  limit = 50,
): Promise<FundTransferRecord[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("fund_transfers")
    .select("id, oc_id, from_fund, to_fund, amount, transfer_date, reason, created_at")
    .eq("oc_id", ocId)
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load fund transfers: ${error.message}`);

  return (data ?? []).map((t) => ({
    id: t.id,
    oc_id: t.oc_id,
    from_fund: t.from_fund,
    to_fund: t.to_fund,
    amount: Number(t.amount),
    transfer_date: t.transfer_date,
    reason: t.reason,
    created_at: t.created_at,
  }));
}
