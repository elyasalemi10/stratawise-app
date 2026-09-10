import "server-only";
import { logAudit } from "@/lib/audit";
import { createServerClient } from "@/lib/supabase";

interface LotDrnRow {
  drn: string;
  lot_id: string;
  active_from: string;
  active_to: string | null;
}

interface OpenLevyRow {
  id: string;
  lot_id: string;
  fund_type: "operating";
  reference_number: string;
  amount: number | string;
  amount_paid: number | string;
  due_date: string;
  status: string;
}

interface BankTxnRow {
  id: string;
  oc_id: string;
  bank_account_id: string;
  transaction_date: string;
  amount: number | string;
  description: string | null;
  match_status: string;
  matched_total: number | string;
  is_voided: boolean;
}

interface AutoMatchResult {
  matched: number;
  skipped: number;
}

/**
 * Two-strategy auto-matcher run after every CSV import:
 *
 *      → allocates to that lot's oldest open levy notice.
 *   2. Owner-reference scan: description / DRN field substring-matches an
 *      only, multiple hits stay unmatched.
 *
 * No fuzzy sender matching, no amount-only matching, no bank_payer_mappings
 * fallback (per the cascade restriction the user asked for).
 *
 * Settlement: this runs as direct UPDATEs against levy_notices.amount_paid
 * and bank_transactions.match_status / matched_total. It does NOT use
 * rpc_reconcile_bank_transaction because that RPC depends on a ledger /
 * reconciliation_matches stack that isn't built yet. The trade-off is that
 * there's no atomic audit row per match, the audit lives on the
 * bank_transaction itself (notes + match_status) and in the levy_notice's
 * amount_paid / status. Good enough until the ledger lands.
 */
export async function autoMatchBankTransactions(
  ocId: string,
  bankTransactionIds: string[],
  performedBy: string,
): Promise<AutoMatchResult> {
  if (bankTransactionIds.length === 0) return { matched: 0, skipped: 0 };
  const supabase = createServerClient();

  const { data: txnsRaw } = await supabase
    .from("bank_transactions")
    .select(
      "id, oc_id, bank_account_id, transaction_date, amount, description, match_status, matched_total, is_voided",
    )
    .in("id", bankTransactionIds);
  const txns = ((txnsRaw ?? []) as BankTxnRow[]).filter(
    (t) =>
      !t.is_voided &&
      t.match_status === "unmatched" &&
      Number(t.matched_total) === 0 &&
      Number(t.amount) > 0,
  );
  if (txns.length === 0) return { matched: 0, skipped: 0 };

  const { data: lotsForOc } = await supabase
    .from("lots")
    .select("id")
    .eq("oc_id", ocId);
  const ocLotIds = ((lotsForOc ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (ocLotIds.length === 0) {
    return { matched: 0, skipped: txns.length };
  }


  const { data: levyRows } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, fund_type, reference_number, amount, amount_paid, due_date, status",
    )
    .eq("oc_id", ocId)
    .in("status", ["issued", "partially_paid", "overdue"])
    .order("due_date", { ascending: true });
  // Build a mutable working copy so a second txn in the same batch sees
  // the updated amount_paid from the first match (otherwise we'd over-pay
  // when two payments arrive against the same levy in one import).
  const openLevies: OpenLevyRow[] = ((levyRows ?? []) as OpenLevyRow[]).map((l) => ({ ...l }));
  const leviesByLot = new Map<string, OpenLevyRow[]>();
  for (const l of openLevies) {
    if (!leviesByLot.has(l.lot_id)) leviesByLot.set(l.lot_id, []);
    leviesByLot.get(l.lot_id)!.push(l);
  }

  let matched = 0;
  let skipped = 0;

  for (const t of txns) {
    const choice = chooseLevyForTxn(t, openLevies);
    if (!choice) {
      skipped++;
      continue;
    }
    const txnAmount = Number(t.amount);
    const outstanding = Number(choice.levy.amount) - Number(choice.levy.amount_paid);
    const allocated = Math.min(txnAmount, Math.max(outstanding, 0));
    if (allocated <= 0) {
      skipped++;
      continue;
    }

    const ok = await applyMatch(supabase, {
      txnId: t.id,
      txnAmount,
      txnDate: t.transaction_date,
      allocated,
      levy: choice.levy,
      method: choice.method,
      performedBy,
      ocId,
    });
    if (ok) {
      // Reflect the new amount_paid in our in-memory levy cache so the
      // next iteration doesn't double-allocate to a now-saturated notice.
      choice.levy.amount_paid = Number(choice.levy.amount_paid) + allocated;
      if (Number(choice.levy.amount_paid) >= Number(choice.levy.amount)) {
        choice.levy.status = "paid";
      } else {
        choice.levy.status = "partially_paid";
      }
      matched++;
    } else {
      skipped++;
    }
  }

  return { matched, skipped };
}

interface ChosenLevy {
  levy: OpenLevyRow;
  method: "auto_reference";
}

// One strategy: does the levy's own reference appear in what the bank told
// us about the payment?
//
// This was a cascade , DRN first, then BPAY CRN, then the reference , with
// the DRN branch resolving to a lot and guessing which of its levies was
// meant. DRN and BPAY are gone (see the notes on the levy notice), and the
// guessing was the wrong trade at this size: a manager with thirty lots
// recognises their own payers instantly, and a wrong automatic allocation
// costs far more to find than an unmatched row costs to clear.
//
// So: an unambiguous single hit matches. Anything else waits for a human.
function chooseLevyForTxn(
  txn: BankTxnRow,
  allLevies: OpenLevyRow[],
): ChosenLevy | null {
  const haystack = `${txn.description ?? ""}`.trim().toUpperCase();
  if (!haystack) return null;

  const hits = new Set<string>();
  for (const levy of allLevies) {
    const ref = levy.reference_number?.toUpperCase();
    if (ref && haystack.includes(ref)) hits.add(levy.id);
  }
  // Two candidates is not a match, it is a coin toss.
  if (hits.size !== 1) return null;

  const levyId = Array.from(hits)[0];
  return { levy: allLevies.find((l) => l.id === levyId)!, method: "auto_reference" };
}

function pickLevyForLot(
  lotId: string,
  leviesByLot: Map<string, OpenLevyRow[]>,
): OpenLevyRow | null {
  const list = leviesByLot.get(lotId);
  if (!list || list.length === 0) return null;
  // Skip levies that are already fully paid (mutated by an earlier iter).
  const open = list.find(
    (l) => Number(l.amount_paid) < Number(l.amount) && l.status !== "paid",
  );
  return open ?? null;
}

interface ApplyArgs {
  txnId: string;
  txnAmount: number;
  txnDate: string;
  allocated: number;
  levy: OpenLevyRow;
  method: "auto_reference";
  performedBy: string;
  ocId: string;
}

async function applyMatch(
  supabase: ReturnType<typeof createServerClient>,
  args: ApplyArgs,
): Promise<boolean> {
  const newAmountPaid = Number(args.levy.amount_paid) + args.allocated;
  const fullyPaid = newAmountPaid >= Number(args.levy.amount);

  const { error: levyErr } = await supabase
    .from("levy_notices")
    .update({
      amount_paid: newAmountPaid,
      status: fullyPaid ? "paid" : "partially_paid",
      paid_at: fullyPaid ? new Date().toISOString() : null,
    })
    .eq("id", args.levy.id);
  if (levyErr) {
    console.error("auto-match: levy update failed", {
      levy_id: args.levy.id,
      reason: levyErr.message,
    });
    return false;
  }

  // The payment itself. lot-balance.ts subtracts the `payments` table and
  // nothing else, so a match that only moved amount_paid left the owner's
  // balance at the full arrears with a levy notice next to it marked paid.
  // The unique index on bank_transaction_id means a re-run cannot double it.
  const { error: payErr } = await supabase.from("payments").insert({
    oc_id: args.ocId,
    lot_id: args.levy.lot_id,
    levy_notice_id: args.levy.id,
    amount: args.allocated,
    payment_date: args.txnDate,
    payment_method: "eft",
    match_confidence: "exact_reference",
    fund_type: args.levy.fund_type,
    bank_transaction_id: args.txnId,
    reference_number: args.levy.reference_number,
    recorded_by: args.performedBy,
  });
  if (payErr) {
    console.error("auto-match: payment insert failed", {
      bank_transaction_id: args.txnId,
      reason: payErr.message,
    });
    await supabase
      .from("levy_notices")
      .update({
        amount_paid: Number(args.levy.amount_paid),
        status: args.levy.status,
        paid_at: null,
      })
      .eq("id", args.levy.id);
    return false;
  }

  const fullyMatched = args.allocated >= args.txnAmount;
  const matchNote = `Auto-matched to ${args.levy.reference_number} via ${
    args.method === "auto_reference" ? "DRN" : "owner reference"
  }`;

  const { error: txnErr } = await supabase
    .from("bank_transactions")
    .update({
      matched_total: args.allocated,
      match_status: fullyMatched ? "auto_matched" : "unmatched",
      notes: matchNote,
    })
    .eq("id", args.txnId);
  if (txnErr) {
    console.error("auto-match: txn update failed", {
      bank_transaction_id: args.txnId,
      reason: txnErr.message,
    });
    // Best-effort rollback of the payment and the levy_notice update so we
    // don't leave a double-paid notice behind.
    await supabase.from("payments").delete().eq("bank_transaction_id", args.txnId);
    await supabase
      .from("levy_notices")
      .update({
        amount_paid: Number(args.levy.amount_paid),
        status: args.levy.status,
        paid_at: null,
      })
      .eq("id", args.levy.id);
    return false;
  }

  // Money arriving is the most important event on a lot's timeline and it
  // was the one thing never written to the audit log, so the History tab's
  // payment branch could not fire. metadata.lot_id is what the lot feed
  // matches on: the entity here is a levy notice, not the lot.
  await logAudit({
    profileId: args.performedBy,
    ocId: args.ocId,
    action: "payment_matched",
    entityType: "payment",
    entityId: args.txnId,
    after: {
      lot_id: args.levy.lot_id,
      levy_notice_id: args.levy.id,
      reference_number: args.levy.reference_number,
      amount: args.allocated,
      matched_by: args.method,
    },
    metadata: { lot_id: args.levy.lot_id },
  });

  return true;
}
