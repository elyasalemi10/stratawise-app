"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

/**
 * Manual reconcile: same settlement model as the auto-matcher in
 * src/lib/banking/auto-match.ts — direct UPDATEs on levy_notices and
 * bank_transactions. We skip rpc_reconcile_bank_transaction because its
 * downstream tables (reconciliation_matches, lot_ledger_entries) don't
 * exist yet in this environment. When the ledger lands, both this action
 * and the auto-matcher should switch back to the RPC together.
 */
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

  const { data: txn, error: txnFetchErr } = await supabase
    .from("bank_transactions")
    .select("id, amount, matched_total, match_status, is_voided")
    .eq("id", input.bankTransactionId)
    .maybeSingle();
  if (txnFetchErr || !txn) return { error: "Could not load the transaction." };
  if (txn.is_voided) return { error: "This transaction is voided." };
  if (txn.match_status === "excluded") {
    return { error: "This transaction is excluded from reconciliation." };
  }

  const txnAmount = Number(txn.amount);
  const alreadyMatched = Number(txn.matched_total ?? 0);
  const remaining = txnAmount - alreadyMatched;
  if (input.amount > remaining + 0.001) {
    return { error: "Allocation exceeds the unmatched amount." };
  }

  // If a levy notice is linked, advance its amount_paid.
  if (input.levyNoticeId) {
    const { data: levy, error: levyFetchErr } = await supabase
      .from("levy_notices")
      .select("id, amount, amount_paid, status, lot_id, fund_type")
      .eq("id", input.levyNoticeId)
      .maybeSingle();
    if (levyFetchErr || !levy) return { error: "Levy notice not found." };
    if (levy.lot_id !== input.lotId) {
      return { error: "Levy notice doesn't belong to that lot." };
    }
    const newAmountPaid = Number(levy.amount_paid) + input.amount;
    const fullyPaid = newAmountPaid >= Number(levy.amount);
    const { error: levyUpdErr } = await supabase
      .from("levy_notices")
      .update({
        amount_paid: newAmountPaid,
        status: fullyPaid ? "paid" : "partially_paid",
        paid_at: fullyPaid ? new Date().toISOString() : null,
      })
      .eq("id", input.levyNoticeId);
    if (levyUpdErr) {
      console.error("manual reconcile: levy update failed", levyUpdErr.message);
      return { error: "Could not update the levy notice." };
    }
  }

  const newMatchedTotal = alreadyMatched + input.amount;
  const fullyMatched = newMatchedTotal >= txnAmount;
  const noteLine = input.notes?.trim()
    ? `Manually matched: ${input.notes.trim()}`
    : "Manually matched";
  const { error: txnUpdErr } = await supabase
    .from("bank_transactions")
    .update({
      matched_total: newMatchedTotal,
      match_status: fullyMatched ? "manually_matched" : "unmatched",
      notes: noteLine,
    })
    .eq("id", input.bankTransactionId);
  if (txnUpdErr) {
    console.error("manual reconcile: txn update failed", txnUpdErr.message);
    return { error: "Could not save the match." };
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: input.ocId,
    action: "reconciliation.manual_match",
    entity_type: "bank_transaction",
    entity_id: input.bankTransactionId,
    metadata: {
      lot_id: input.lotId,
      fund_type: input.fundType,
      amount: input.amount,
      levy_notice_id: input.levyNoticeId,
      notes: input.notes ?? null,
    },
  });

  revalidatePath("/ocs/[ocCode]/reconciliation", "page");
  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return { ok: true };
}
