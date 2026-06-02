import "server-only";
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
  fund_type: "operating" | "maintenance_plan";
  reference_number: string;
  bpay_crn: string | null;
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
  deft_reference_number: string | null;
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
 *   1. DRN exact match against lot_drns (date-aware via active_from/active_to)
 *      → allocates to that lot's oldest open levy notice.
 *   2. Owner-reference scan: description / DRN field substring-matches an
 *      open levy_notice.reference_number (LEV-{n}) or bpay_crn. Single hit
 *      only — multiple hits stay unmatched.
 *
 * No fuzzy sender matching, no amount-only matching, no bank_payer_mappings
 * fallback (per the cascade restriction the user asked for).
 *
 * Settlement: this runs as direct UPDATEs against levy_notices.amount_paid
 * and bank_transactions.match_status / matched_total. It does NOT use
 * rpc_reconcile_bank_transaction because that RPC depends on a ledger /
 * reconciliation_matches stack that isn't built yet. The trade-off is that
 * there's no atomic audit row per match — the audit lives on the
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
      "id, oc_id, bank_account_id, transaction_date, amount, description, deft_reference_number, match_status, matched_total, is_voided",
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

  const { data: drnRows } = await supabase
    .from("lot_drns")
    .select("drn, lot_id, active_from, active_to")
    .in("lot_id", ocLotIds);
  const drnIndex = new Map<string, LotDrnRow[]>();
  for (const row of (drnRows ?? []) as LotDrnRow[]) {
    const key = row.drn.trim().toUpperCase();
    if (!drnIndex.has(key)) drnIndex.set(key, []);
    drnIndex.get(key)!.push(row);
  }

  const { data: levyRows } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, fund_type, reference_number, bpay_crn, amount, amount_paid, due_date, status",
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
    const choice = chooseLevyForTxn(t, drnIndex, openLevies, leviesByLot);
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
      allocated,
      levy: choice.levy,
      method: choice.method,
      performedBy,
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
  method: "auto_reference" | "auto_bpay_crn";
}

function chooseLevyForTxn(
  txn: BankTxnRow,
  drnIndex: Map<string, LotDrnRow[]>,
  allLevies: OpenLevyRow[],
  leviesByLot: Map<string, OpenLevyRow[]>,
): ChosenLevy | null {
  // Strategy 1: DRN. Single, exact, date-bounded. Resolves to a lot; then
  // we pick the lot's oldest open levy.
  const drn = (txn.deft_reference_number ?? "").trim().toUpperCase();
  if (drn) {
    const rows = drnIndex.get(drn) ?? [];
    const active = rows.filter(
      (r) =>
        r.active_from <= txn.transaction_date &&
        (r.active_to == null || r.active_to >= txn.transaction_date),
    );
    if (active.length === 1) {
      const lotId = active[0].lot_id;
      const levy = pickLevyForLot(lotId, leviesByLot);
      if (levy) return { levy, method: "auto_reference" };
    }
  }

  // Strategy 2: owner reference. The payer typed a reference (BPAY CRN or
  // the LEV-{n} number) that appears in the description / reference field.
  // Single match wins; multiple hits stay unmatched.
  const haystack = `${txn.description ?? ""} ${txn.deft_reference_number ?? ""}`
    .trim()
    .toUpperCase();
  if (!haystack) return null;

  const hits = new Set<string>();
  for (const levy of allLevies) {
    const ref = levy.reference_number?.toUpperCase();
    const crn = levy.bpay_crn?.toUpperCase();
    if (ref && haystack.includes(ref)) hits.add(levy.id);
    else if (crn && haystack.includes(crn)) hits.add(levy.id);
  }
  if (hits.size !== 1) return null;

  const levyId = Array.from(hits)[0];
  const levy = allLevies.find((l) => l.id === levyId)!;
  return { levy, method: "auto_bpay_crn" };
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
  allocated: number;
  levy: OpenLevyRow;
  method: "auto_reference" | "auto_bpay_crn";
  performedBy: string;
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
    // Best-effort rollback of the levy_notice update so we don't leave a
    // double-paid notice behind.
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

  return true;
}
