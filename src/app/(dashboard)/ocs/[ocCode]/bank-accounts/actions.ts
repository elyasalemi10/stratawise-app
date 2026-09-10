"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { autoMatchBankTransactions } from "@/lib/banking/auto-match";
import { logAudit } from "@/lib/audit";

/**
 * Persist a batch of parsed CSV rows as bank_transactions, then run the
 * two-strategy auto-matcher (DRN → owner reference) on every newly-inserted
 * credit-direction row. Imports themselves stay append-only (no dedup),
 * managers re-upload whenever they want a fresh snapshot. Auto-matched rows
 * land at match_status='auto_matched'; everything else stays 'unmatched' and
 * surfaces on the reconciliation queue.
 */
export async function importBankTransactions(
  ocId: string,
  accountId: string,
  rows: Array<{
    date: string | null;
    description: string;
    amount: number | null;
    balance: number | null;
    reference: string | null;
  }>,
): Promise<{ inserted?: number; auto_matched?: number; duplicates?: number; unreadable?: number; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: account } = await supabase
    .from("bank_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!account) return { error: "Bank account not found." };

  // A row we could not read a date or an amount out of is not a
  // transaction. They used to be inserted anyway, which put rows with no
  // date and no amount into the ledger where nothing could match them and
  // nothing would ever clean them up.
  const usable = rows.filter((r) => r.date !== null && r.amount !== null);
  const unreadable = rows.length - usable.length;

  // What is already here, so re-uploading a statement does not double it.
  //
  // Managers export overlapping windows constantly: last month again with
  // this month, or the same file twice because the first upload was not
  // obviously finished. There is no import id to compare against, so the
  // key is what a duplicate actually looks like: same account, same day,
  // same amount, same description.
  const dates = [...new Set(usable.map((r) => r.date!))].sort();
  const { data: existingRows } = dates.length
    ? await supabase
        .from("bank_transactions")
        .select("transaction_date, amount, description")
        .eq("bank_account_id", accountId)
        .gte("transaction_date", dates[0])
        .lte("transaction_date", dates[dates.length - 1])
    : { data: [] };

  const fingerprint = (d: string, a: number, desc: string) =>
    `${d}|${a.toFixed(2)}|${desc.trim().toLowerCase()}`;
  const seen = new Set(
    ((existingRows ?? []) as Array<{ transaction_date: string; amount: number; description: string | null }>).map(
      (r) => fingerprint(r.transaction_date, Number(r.amount), r.description ?? ""),
    ),
  );

  const inserts: Array<Record<string, unknown>> = [];
  let duplicates = 0;
  for (const r of usable) {
    // The reference column the manager mapped has nowhere of its own to
    // live yet, and the matcher searches the description, so a reference
    // kept anywhere else is a reference nothing can match on. Appended
    // only when the description does not already contain it, so a file
    // that repeats it does not say it twice.
    const rawDesc = (r.description ?? "").trim();
    const ref = (r.reference ?? "").trim();
    const description = (
      ref && !rawDesc.toUpperCase().includes(ref.toUpperCase())
        ? `${rawDesc} ${ref}`.trim()
        : rawDesc
    ).slice(0, 1000);

    const key = fingerprint(r.date!, r.amount!, description);
    // Guards against duplicates already in the table AND against the same
    // line appearing twice inside one file.
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    inserts.push({
      oc_id: ocId,
      bank_account_id: accountId,
      source: "csv_import" as const,
      transaction_date: r.date,
      description,
      amount: r.amount,
      balance: r.balance,
      imported_by: profile.id,
    });
  }

  let insertedIds: string[] = [];
  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .insert(inserts)
      .select("id");
    if (error) {
      // The raw Postgres message names columns and constraints. The
      // operator gets it in the logs; the manager gets something they can
      // act on.
      console.error("[bank-import] insert failed:", error);
      return { error: "Couldn't import those transactions, please try again." };
    }
    insertedIds = (data ?? []).map((r) => r.id as string);
  }

  let autoMatched = 0;
  if (insertedIds.length > 0) {
    // Auto-match is best-effort: the underlying RPC depends on tables
    // (reconciliation_matches, lot_ledger_entries) that may not exist yet
    // in this environment. Don't let a matcher failure break the import.
    try {
      const result = await autoMatchBankTransactions(
        ocId,
        insertedIds,
        profile.id,
      );
      autoMatched = result.matched;
    } catch (err) {
      console.error("auto-match orchestrator failed", err);
    }
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "import",
    entity_type: "bank_account",
    entity_id: accountId,
    after_state: {
      transactions_imported: inserts.length,
      auto_matched: autoMatched,
    },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return { inserted: inserts.length, auto_matched: autoMatched, duplicates, unreadable };
}

/**
 * Create a new bank account for an OC. Triggered from the "+" tab on the
 * bank accounts page. The new row is unlinked , no fund_type / fund_id
 * gets set here. A separate step on the funds page links it to a fund.
 */
export async function createBankAccount(
  ocId: string,
  data: {
    account_name: string;
    bsb: string;
    account_number: string;
    bank_name: string | null;
  },
): Promise<{ id?: string; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);

  const accountName = data.account_name.trim();
  const bsb = data.bsb.trim();
  const accountNumber = data.account_number.trim();
  if (!accountName) return { error: "Account name is required." };
  if (!/^\d{3}-?\d{3}$/.test(bsb)) return { error: "BSB must be 6 digits." };
  if (!/^\d{6,9}$/.test(accountNumber)) return { error: "Account number must be 6-9 digits." };

  const supabase = createServerClient();

  // If this is the OC's first bank account, auto-link it to the OC's
  // operating ("admin") fund, that's the account the admin fund draws
  // to/from. We only do this when there are zero existing bank_accounts;
  // subsequent accounts can be linked from the funds page like usual.
  const { count: existingCount } = await supabase
    .from("bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", ocId);

  let operatingFundId: string | null = null;
  if (!existingCount || existingCount === 0) {
    const { data: opFund } = await supabase
      .from("funds")
      .select("id")
      .eq("oc_id", ocId)
      .eq("kind", "admin")
      .maybeSingle();
    operatingFundId = opFund?.id ?? null;
  }

  const { data: row, error } = await supabase
    .from("bank_accounts")
    .insert({
      oc_id: ocId,
      fund_type: "operating",
      fund_id: operatingFundId,
      account_name: accountName,
      bsb,
      account_number: accountNumber,
      bank_name: data.bank_name || null,
    })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "Could not create bank account." };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "bank_account",
    entity_id: row.id,
    after_state: {
      account_name: accountName,
      bsb,
      account_number: accountNumber,
      bank_name: data.bank_name,
    },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  return { id: row.id };
}

/**
 * Delete a physical bank account. Allowed only while the OC keeps at least
 * one other physical account , an OC with no account has nowhere to receive
 * levies. The surviving account is promoted to the primary operating one
 * (fund_type='operating'), which is what the levy notice EFT block and the
 * account tab order both key off, and it adopts any fund the deleted
 * account was linked to so no fund is left without an account.
 *
 * Imported statement lines go with the account (FK cascade). Accounts with
 * fund transfers or banked receipts against them are refused , those are
 * posted financial records, not a re-importable statement.
 */
export async function deleteBankAccount(
  ocId: string,
  accountId: string,
): Promise<{ promotedAccountId?: string; error?: string }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("bank_accounts")
    .select("id, account_name, bsb, account_number, bank_name, fund_type, fund_id, parent_account_id, created_at")
    .eq("oc_id", ocId);

  type Row = {
    id: string;
    account_name: string | null;
    bsb: string | null;
    account_number: string | null;
    bank_name: string | null;
    fund_type: string;
    fund_id: string | null;
    parent_account_id: string | null;
    created_at: string;
  };
  const all = (accounts ?? []) as Row[];
  const target = all.find((a) => a.id === accountId);
  if (!target) return { error: "Bank account not found." };
  if (target.parent_account_id) {
    return { error: "This is a fund's link to a shared account. Remove it from the funds page." };
  }

  const physical = all.filter((a) => !a.parent_account_id);
  if (physical.length <= 1) {
    return { error: "This is the only bank account for this Owners Corporation. Add another one before deleting it." };
  }

  // The account plus every fund-link row hanging off it.
  const children = all.filter((a) => a.parent_account_id === accountId);
  const doomedIds = [accountId, ...children.map((c) => c.id)];

  const [transfers, receipts] = await Promise.all([
    supabase
      .from("fund_transfers")
      .select("id", { count: "exact", head: true })
      .or(
        `from_bank_account_id.in.(${doomedIds.join(",")}),to_bank_account_id.in.(${doomedIds.join(",")})`,
      ),
    supabase
      .from("undeposited_funds_entries")
      .select("id", { count: "exact", head: true })
      .in("bank_account_id", doomedIds),
  ]);
  if (transfers.count) {
    return { error: "This account has fund transfers recorded against it, so it can't be deleted." };
  }
  if (receipts.count) {
    return { error: "This account has receipts banked to it, so it can't be deleted." };
  }

  // Successor: an account already flagged operating if there is one,
  // otherwise the oldest survivor. Deterministic either way, so the tab
  // order after the delete matches what the manager was told.
  const remaining = physical
    .filter((a) => a.id !== accountId)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const successor = remaining.find((a) => a.fund_type === "operating") ?? remaining[0];

  // Funds that lose their account when this one goes. Re-point them at the
  // successor: straight onto it while it has no fund of its own, otherwise
  // as a shared-account child row (the same shape the funds page creates).
  const stillLinkedFundIds = new Set(
    all
      .filter((a) => !doomedIds.includes(a.id))
      .map((a) => a.fund_id)
      .filter((id): id is string => !!id),
  );
  const orphanedFundIds = [target.fund_id, ...children.map((c) => c.fund_id)]
    .filter((id): id is string => !!id)
    .filter((id) => !stillLinkedFundIds.has(id));

  let successorFundId = successor.fund_id;
  const childInserts: Array<{
    oc_id: string;
    fund_id: string;
    fund_type: string;
    parent_account_id: string;
    account_name: string;
  }> = [];
  for (const fundId of orphanedFundIds) {
    if (!successorFundId) {
      successorFundId = fundId;
      continue;
    }
    const { data: fund } = await supabase
      .from("funds")
      .select("name, kind")
      .eq("id", fundId)
      .maybeSingle();
    const f = fund as { name: string; kind: string } | null;
    childInserts.push({
      oc_id: ocId,
      fund_id: fundId,
      // Every fund maps to the admin fund now; fund_id carries which one.
      fund_type: "operating",
      parent_account_id: successor.id,
      account_name: f?.name ?? successor.account_name ?? "Bank account",
    });
  }

  // Children first , they point at the row we're about to remove.
  if (children.length > 0) {
    const { error: childErr } = await supabase
      .from("bank_accounts")
      .delete()
      .in("id", children.map((c) => c.id));
    if (childErr) return { error: "Could not delete this bank account." };
  }
  const { error: delErr } = await supabase
    .from("bank_accounts")
    .delete()
    .eq("id", accountId)
    .eq("oc_id", ocId);
  if (delErr) {
    console.error("deleteBankAccount: delete failed", delErr);
    return { error: "Could not delete this bank account." };
  }

  // Promote the survivor. fund_type is the legacy flag the levy EFT lookup
  // and the tab sort still read, so the OC always has one account marked
  // operating.
  const { error: promoteErr } = await supabase
    .from("bank_accounts")
    .update({ fund_type: "operating", fund_id: successorFundId })
    .eq("id", successor.id);
  if (promoteErr) console.error("deleteBankAccount: promote failed", promoteErr);

  if (childInserts.length > 0) {
    const { error: reparentErr } = await supabase.from("bank_accounts").insert(childInserts);
    if (reparentErr) console.error("deleteBankAccount: fund re-link failed", reparentErr);
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "delete",
    entity_type: "bank_account",
    entity_id: accountId,
    before_state: {
      account_name: target.account_name,
      bsb: target.bsb,
      account_number: target.account_number,
      bank_name: target.bank_name,
      fund_type: target.fund_type,
      fund_id: target.fund_id,
      linked_fund_rows: children.length,
    },
    after_state: {
      promoted_account_id: successor.id,
      promoted_account_name: successor.account_name,
      funds_relinked: orphanedFundIds.length,
    },
  });

  revalidatePath("/ocs/[ocCode]/bank-accounts", "page");
  revalidatePath("/ocs/[ocCode]/funds", "page");
  return { promotedAccountId: successor.id };
}

/**
 * Say what a transaction was for.
 *
 * For money going OUT this is a label and nothing else: naming the plumber
 * on a payment moves no balance, and there is no notice to reconcile it
 * against.
 *
 * For money coming IN and assigned to a LOT it is the reconciliation. The
 * lot's balance is opening + charged - payments (see lot-balance.ts), and
 * `payments` is the only subtraction in it, so a receipt that is not written
 * there does not reduce what the owner owes no matter what else it updates.
 * That was the bug: the row said the payment belonged to the lot and the lot
 * still showed the full arrears.
 *
 * One payment per bank transaction, enforced by a unique index, so a receipt
 * that auto-matched on import and is then re-assigned by hand cannot be
 * subtracted twice.
 */
export async function assignTransactionEntity(
  ocId: string,
  transactionId: string,
  entity: { kind: "lot" | "contractor" | "maintenance_request"; id: string } | null,
): Promise<{ error?: string; paymentRecorded?: boolean }> {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  // The target has to belong to this OC, or a manager could label a payment
  // with another company's contractor by id.
  if (entity) {
    const table =
      entity.kind === "lot" ? "lots"
      : entity.kind === "contractor" ? "contractors"
      : "maintenance_requests";
    const { data: owner } = await supabase
      .from(table)
      .select("id")
      .eq("id", entity.id)
      .eq("oc_id", ocId)
      .maybeSingle();
    if (!owner) return { error: "That is not something on this Owners Corporation." };
  }

  const { data: txn } = await supabase
    .from("bank_transactions")
    .select("id, amount, transaction_date, description, bank_account_id, entity_kind, entity_id")
    .eq("id", transactionId)
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!txn) return { error: "That transaction is no longer here." };

  const amount = txn.amount !== null ? Number(txn.amount) : 0;
  const isReceipt = amount > 0;
  const wantsPayment = isReceipt && entity?.kind === "lot";

  // Whatever it used to be attributed to stops being true the moment this
  // changes, so the old payment goes before the new one is written. Deleting
  // unconditionally also covers "was a lot, now a contractor" and "cleared".
  const { error: clearErr } = await supabase
    .from("payments")
    .delete()
    .eq("bank_transaction_id", transactionId)
    .eq("oc_id", ocId);
  if (clearErr) {
    console.error("assignTransactionEntity: could not clear the old payment", clearErr);
    return { error: "Couldn't save that. Try again." };
  }

  if (wantsPayment) {
    // Which fund it lands in comes from the account it arrived in, not from
    // a guess: an OC with separate trust accounts has one per fund, and a
    // shared account still names one on the row.
    const { data: account } = await supabase
      .from("bank_accounts")
      .select("fund_type")
      .eq("id", txn.bank_account_id)
      .maybeSingle();

    const { error: payErr } = await supabase.from("payments").insert({
      oc_id: ocId,
      lot_id: entity!.id,
      amount,
      payment_date: txn.transaction_date ?? new Date().toISOString().slice(0, 10),
      payment_method: "eft",
      match_confidence: "manual",
      fund_type: account?.fund_type ?? "operating",
      bank_transaction_id: transactionId,
      payment_reference: (txn.description ?? "").slice(0, 200) || null,
      recorded_by: profile.id,
    });
    if (payErr) {
      console.error("assignTransactionEntity: payment insert failed", payErr);
      return { error: "Couldn't record that payment. Try again." };
    }
  }

  const { error } = await supabase
    .from("bank_transactions")
    .update({
      entity_kind: entity?.kind ?? null,
      entity_id: entity?.id ?? null,
      entity_assigned_at: entity ? new Date().toISOString() : null,
      entity_assigned_by: entity ? profile.id : null,
      // Only a receipt attributed to a lot is reconciled. A labelled expense
      // is still unmatched, because there was never anything to match it to.
      match_status: wantsPayment ? "manually_matched" : "unmatched",
      matched_total: wantsPayment ? amount : 0,
    })
    .eq("id", transactionId)
    .eq("oc_id", ocId);

  if (error) {
    console.error("assignTransactionEntity failed", error);
    return { error: "Couldn't save that. Try again." };
  }

  if (wantsPayment) {
    await logAudit({
      profileId: profile.id,
      ocId,
      action: "payment_matched",
      entityType: "payment",
      entityId: transactionId,
      after: { lot_id: entity!.id, amount, matched_by: "manual" },
      metadata: { lot_id: entity!.id },
    });
  }

  revalidatePath(`/ocs/${ocId}/bank-accounts`);
  return { paymentRecorded: wantsPayment };
}
