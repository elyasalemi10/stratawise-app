import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// What a lot owes. One definition, used by every screen that shows it.
//
// There were five, and they did not agree. The manager-facing lot register
// and lot detail counted the opening balance; the three owner-facing screens
// (their dashboard, /levies, and the OC overview) did not. The same lot
// therefore showed one number to the manager and a smaller one to the owner
// who was being chased for it, which is the worst possible place for an
// arithmetic disagreement.
//
// The formula, and why each term is in it:
//
//   opening_balance  what the lot owed when the OC was onboarded. Real money,
//                    set during the wizard, and the reason a brand-new OC can
//                    have arrears on day one. Sign convention is
//                    owes-positive, matching the wizard, so it adds directly.
//   + outstanding    levy notices in issued / partially_paid / overdue. Draft
//                    notices are not owed yet; paid and written_off are done.
//   - payments       everything received against the lot.
//
// NOT lot_ledger_state. That table exists, has a row per lot, and is
// maintained by recompute_lot_ledger_state() off lot_ledger_entries , but
// nothing writes entries during levy issuance, so it currently reports zero
// for every lot while the real balances are not zero. Reading it would put
// $0 on 31 lots. It is either wired up properly or dropped; until then this
// arithmetic is the only thing telling the truth.

/** Levy statuses that represent money still owed. */
export const OUTSTANDING_LEVY_STATUSES = [
  "issued",
  "partially_paid",
  "overdue",
] as const;

export interface LotBalance {
  /** Opening balance carried in at onboarding. Owes-positive. */
  opening: number;
  /** Sum of outstanding levy notices. */
  levied: number;
  /** Sum of payments received. */
  paid: number;
  /** opening + levied - paid. Positive means the lot owes. */
  balance: number;
}

export const ZERO_BALANCE: LotBalance = { opening: 0, levied: 0, paid: 0, balance: 0 };

/**
 * Balances for a set of lots, keyed by lot id.
 *
 * Two round trips regardless of how many lots, and it returns an entry for
 * every id passed so callers never have to handle a missing key.
 */
export async function getLotBalances(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  lotIds: string[],
  /** Opening balances, when the caller already selected them. Saves a query;
   *  omit and they are fetched. */
  openingByLot?: Map<string, number>,
): Promise<Map<string, LotBalance>> {
  const out = new Map<string, LotBalance>();
  if (lotIds.length === 0) return out;

  const [leviesResult, paymentsResult, openingResult] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("lot_id, amount")
      .in("lot_id", lotIds)
      .in("status", OUTSTANDING_LEVY_STATUSES as unknown as string[]),
    supabase.from("payments").select("lot_id, amount").in("lot_id", lotIds),
    openingByLot
      ? Promise.resolve({ data: null })
      : supabase.from("lots").select("id, opening_balance").in("id", lotIds),
  ]);

  const opening =
    openingByLot ??
    new Map(
      ((openingResult.data ?? []) as Array<{ id: string; opening_balance: number | null }>).map(
        (l) => [l.id, Number(l.opening_balance ?? 0)],
      ),
    );

  const levied = new Map<string, number>();
  for (const l of (leviesResult.data ?? []) as Array<{ lot_id: string; amount: number }>) {
    levied.set(l.lot_id, (levied.get(l.lot_id) ?? 0) + Number(l.amount));
  }

  const paid = new Map<string, number>();
  for (const p of (paymentsResult.data ?? []) as Array<{ lot_id: string; amount: number }>) {
    paid.set(p.lot_id, (paid.get(p.lot_id) ?? 0) + Number(p.amount));
  }

  for (const id of lotIds) {
    const o = opening.get(id) ?? 0;
    const l = levied.get(id) ?? 0;
    const p = paid.get(id) ?? 0;
    out.set(id, { opening: o, levied: l, paid: p, balance: o + l - p });
  }
  return out;
}

/** Roll a set of per-lot balances into one total. For the owner dashboard,
 *  which shows "what do I owe across every lot I hold". */
export function sumBalances(balances: Iterable<LotBalance>): LotBalance {
  let opening = 0, levied = 0, paid = 0;
  for (const b of balances) {
    opening += b.opening;
    levied += b.levied;
    paid += b.paid;
  }
  return { opening, levied, paid, balance: opening + levied - paid };
}
