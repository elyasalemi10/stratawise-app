"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export async function reconcileBankTransaction(input: {
  ocId: string;
  bankTransactionId: string;
  lotId: string;
  fundType: "operating" | "maintenance_plan";
  amount: number;
  levyNoticeId: string | null;
  notes: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(input.ocId);

  if (!input.lotId) return { error: "Pick a lot before saving." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const supabase = createServerClient();
  const { error } = await supabase.rpc("rpc_reconcile_bank_transaction", {
    p_bank_transaction_id: input.bankTransactionId,
    p_allocations: [
      {
        lot_id: input.lotId,
        fund_type: input.fundType,
        amount: input.amount,
        levy_notice_id: input.levyNoticeId,
        reference: null,
      },
    ],
    p_match_method: "manual",
    p_match_confidence: "manual",
    p_notes: input.notes,
    p_performed_by: profile.id,
  });

  if (error) {
    console.error("reconcile RPC failed", error.message);
    return { error: "Could not save the match. Try again." };
  }

  revalidatePath("/ocs/[ocCode]/reconciliation", "page");
  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return { ok: true };
}
