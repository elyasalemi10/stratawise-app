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
 * Run the two-strategy auto-matcher on a set of bank transactions:
 *
 *   1. DRN exact match against `lot_drns` (date-aware via active_from/active_to).
 *   2. Owner-reference match: scan the description / reference field for any
 *      open levy_notice.reference_number or bpay_crn substring. Single hit
 *      only — multiple hits stay unmatched so the manager resolves manually.
 *
 * Nothing else (no fuzzy sender matching, no amount-only matching). Anything
 * the cascade can't resolve stays at match_status='unmatched' for the
 * reconciliation queue.
 *
 * The function is idempotent: it skips rows that are already matched,
 * excluded, voided, or debit-direction.
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

  // Open / partly-paid levy notices for the OC. Paid/written-off/draft are
  // skipped — auto-match only goes against notices a payer can still send
  // money against.
  const { data: levyRows } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, fund_type, reference_number, bpay_crn, amount, amount_paid, due_date, status",
    )
    .eq("oc_id", ocId)
    .in("status", ["issued", "partially_paid", "overdue"])
    .order("due_date", { ascending: true });
  const openLevies = (levyRows ?? []) as OpenLevyRow[];
  const leviesByLot = new Map<string, OpenLevyRow[]>();
  for (const l of openLevies) {
    if (!leviesByLot.has(l.lot_id)) leviesByLot.set(l.lot_id, []);
    leviesByLot.get(l.lot_id)!.push(l);
  }

  let matched = 0;
  let skipped = 0;

  for (const t of txns) {
    const allocation = chooseAllocation(t, drnIndex, openLevies, leviesByLot);
    if (!allocation) {
      skipped++;
      continue;
    }

    const { error } = await supabase.rpc("rpc_reconcile_bank_transaction", {
      p_bank_transaction_id: t.id,
      p_allocations: [
        {
          lot_id: allocation.lot_id,
          fund_type: allocation.fund_type,
          amount: Number(t.amount),
          levy_notice_id: allocation.levy_notice_id,
          reference: allocation.reference,
        },
      ],
      p_match_method: allocation.method,
      p_match_confidence: "exact_reference",
      p_notes: null,
      p_performed_by: performedBy,
    });
    if (error) {
      console.error("auto-match RPC failed", {
        bank_transaction_id: t.id,
        reason: error.message,
      });
      skipped++;
      continue;
    }
    matched++;
  }

  return { matched, skipped };
}

interface ChosenAllocation {
  lot_id: string;
  fund_type: "operating" | "maintenance_plan";
  levy_notice_id: string | null;
  reference: string | null;
  method: "auto_reference" | "auto_bpay_crn";
}

function chooseAllocation(
  txn: BankTxnRow,
  drnIndex: Map<string, LotDrnRow[]>,
  allLevies: OpenLevyRow[],
  leviesByLot: Map<string, OpenLevyRow[]>,
): ChosenAllocation | null {
  // Strategy 1: DRN. Single, exact, date-bounded.
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
      if (levy) {
        return {
          lot_id: lotId,
          fund_type: levy.fund_type,
          levy_notice_id: levy.id,
          reference: levy.reference_number,
          method: "auto_reference",
        };
      }
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
  return {
    lot_id: levy.lot_id,
    fund_type: levy.fund_type,
    levy_notice_id: levy.id,
    reference: levy.reference_number,
    method: "auto_bpay_crn",
  };
}

function pickLevyForLot(
  lotId: string,
  leviesByLot: Map<string, OpenLevyRow[]>,
): OpenLevyRow | null {
  const list = leviesByLot.get(lotId);
  if (!list || list.length === 0) return null;
  return list[0]; // oldest by due_date — sorted on fetch
}
