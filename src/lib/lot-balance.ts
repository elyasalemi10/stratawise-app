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
//   + charged        every levy notice the lot has been issued, at FACE
//                    value, including ones already paid. Excluded: drafts
//                    (not owed yet), cancelled (never owed) and written_off
//                    (deliberately forgiven).
//   - payments       everything received against the lot.
//
// A notice's payment status is deliberately absent from that. This is a
// balance, not a ledger of paid-versus-unpaid documents: money charged in,
// money received out, one subtraction. The moment status entered the
// arithmetic it could disagree with the payments table, and it did.
//
// NOT lot_ledger_state. That table exists, has a row per lot, and is
// maintained by recompute_lot_ledger_state() off lot_ledger_entries , but
// nothing writes entries during levy issuance, so it currently reports zero
// for every lot while the real balances are not zero. Reading it would put
// $0 on 31 lots. It is either wired up properly or dropped; until then this
// arithmetic is the only thing telling the truth.

/**
 * Levy statuses that count toward what a lot has been CHARGED.
 *
 * This list used to be issued / partially_paid / overdue, and leaving out
 * `paid` was an arithmetic bug, not a simplification. The balance subtracts
 * every payment the lot has made, so a notice dropping out of this set the
 * moment it was paid removed the charge while leaving the payment in place:
 *
 *   $500 levy issued            levied 500, paid   0  ->  owes 500   correct
 *   owner pays $500             levied   0, paid 500  ->  owes -500  wrong
 *
 * Every reconciled lot would have shown a phantom credit for the full value
 * of everything it had ever paid. It had not bitten yet only because no
 * notice had reached `paid` in live data.
 *
 * The fix is the one the whole model is built on: a notice's PAYMENT status
 * must not enter the arithmetic at all. What is charged is charged; what is
 * paid is subtracted once, from the payments table. Status now only excludes
 * things that were never owed (a draft, a cancelled notice) or that have been
 * deliberately forgiven (a write-off).
 */
export const CHARGED_LEVY_STATUSES = [
  "issued",
  "partially_paid",
  "overdue",
  "paid",
] as const;


export interface LotBalance {
  /** Opening balance carried in at onboarding. Owes-positive. */
  opening: number;
  /** Sum of every levy notice charged to the lot, at face value, whether or
   *  not it has been paid. Paid ones are cancelled out by `paid`, not by
   *  being left out of here. */
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
      .in("status", CHARGED_LEVY_STATUSES as unknown as string[]),
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
