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

// ─── Aging: how long has the money been owed ──────────────────────────

export interface LotArrears {
  lotId: string;
  /** opening + charged - paid. Positive means the lot owes. */
  balance: number;
  /** Days since the due date of the oldest charge still uncovered by
   *  payments. Null when nothing is owed. */
  daysOverdue: number | null;
  /** That oldest uncovered charge, for a reminder to quote and for the
   *  final notice to name. Null when nothing is owed, or when the balance
   *  is opening-balance arrears with no notice behind it. */
  oldestUnpaidNoticeId: string | null;
  oldestUnpaidReference: string | null;
  oldestUnpaidDueDate: string | null;
}

/**
 * Age a lot's arrears by applying payments to the OLDEST charge first.
 *
 * This is ordinary receivables aging, and it is what replaces reading a
 * notice's status. A payment does not have to be allocated to a particular
 * notice for the arithmetic to work: the money covers the oldest thing owed,
 * then the next, and whatever is left uncovered is what the lot is behind on.
 *
 * The opening balance is treated as the oldest charge of all, dated at the
 * lot's management start, because that is exactly what it is. A lot onboarded
 * in arrears is behind from day one and used to be invisible to the follow-up
 * sweep for want of a levy notice to key on.
 */
export function ageArrears(input: {
  lotId: string;
  opening: number;
  openingDate: string | null;
  /** Every charge, oldest first. Face value, not net of anything. */
  charges: Array<{ id: string; reference: string | null; dueDate: string; amount: number }>;
  paidTotal: number;
  asOf: string;
}): LotArrears {
  const { lotId, opening, openingDate, charges, paidTotal, asOf } = input;

  const ordered = [
    ...(opening > 0
      ? [{ id: null, reference: null, dueDate: openingDate ?? charges[0]?.dueDate ?? asOf, amount: opening }]
      : []),
    ...[...charges].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  ];

  const charged = ordered.reduce((sum, c) => sum + c.amount, 0);
  // A negative opening balance is a credit and belongs in the subtraction,
  // not in the list of things owed.
  const credit = opening < 0 ? -opening : 0;
  const balance = charged - paidTotal - credit;

  if (balance <= 0) {
    return {
      lotId,
      balance,
      daysOverdue: null,
      oldestUnpaidNoticeId: null,
      oldestUnpaidReference: null,
      oldestUnpaidDueDate: null,
    };
  }

  // Walk the money forward until it runs out. Where it stops is the oldest
  // charge still uncovered.
  let remaining = paidTotal + credit;
  let oldest: (typeof ordered)[number] | undefined;
  for (const c of ordered) {
    if (remaining >= c.amount) {
      remaining -= c.amount;
      continue;
    }
    oldest = c;
    break;
  }

  const dueDate = oldest?.dueDate ?? null;
  const daysOverdue =
    dueDate === null
      ? null
      : Math.floor(
          (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000,
        );

  return {
    lotId,
    balance,
    daysOverdue,
    oldestUnpaidNoticeId: oldest?.id ?? null,
    oldestUnpaidReference: oldest?.reference ?? null,
    oldestUnpaidDueDate: dueDate,
  };
}

/**
 * Arrears for every lot in an OC, aged. Four round trips regardless of how
 * many lots, because the follow-up sweep runs over whole OCs.
 */
export async function getOCArrears(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ocId: string,
  asOf: string,
): Promise<Map<string, LotArrears>> {
  const [lotsRes, chargesRes, paymentsRes] = await Promise.all([
    supabase.from("lots").select("id, opening_balance").eq("oc_id", ocId),
    supabase
      .from("levy_notices")
      .select("id, lot_id, reference_number, due_date, amount")
      .eq("oc_id", ocId)
      .in("status", CHARGED_LEVY_STATUSES as unknown as string[]),
    supabase.from("payments").select("lot_id, amount").eq("oc_id", ocId),
  ]);

  const lots = (lotsRes.data ?? []) as Array<{ id: string; opening_balance: number | null }>;
  type Charge = { id: string; reference: string | null; dueDate: string; amount: number };
  const chargesByLot = new Map<string, Charge[]>();
  for (const c of (chargesRes.data ?? []) as Array<{
    id: string; lot_id: string; reference_number: string | null; due_date: string; amount: number;
  }>) {
    const list = chargesByLot.get(c.lot_id) ?? [];
    list.push({ id: c.id, reference: c.reference_number, dueDate: c.due_date, amount: Number(c.amount) });
    chargesByLot.set(c.lot_id, list);
  }
  const paidByLot = new Map<string, number>();
  for (const p of (paymentsRes.data ?? []) as Array<{ lot_id: string; amount: number }>) {
    paidByLot.set(p.lot_id, (paidByLot.get(p.lot_id) ?? 0) + Number(p.amount));
  }

  const out = new Map<string, LotArrears>();
  for (const lot of lots) {
    out.set(
      lot.id,
      ageArrears({
        lotId: lot.id,
        opening: Number(lot.opening_balance ?? 0),
        openingDate: null,
        charges: chargesByLot.get(lot.id) ?? [],
        paidTotal: paidByLot.get(lot.id) ?? 0,
        asOf,
      }),
    );
  }
  return out;
}
