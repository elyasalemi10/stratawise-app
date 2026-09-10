"use server";

import { createServerClient } from "@/lib/supabase";
import { requireOCAccess } from "@/lib/auth";

// One aggregate fetch plus the grouping the page used to do inline. The
// transform belongs with the fetch, not in the component: the client just
// renders rows.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

interface RawAccountRow {
  id: string;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  fund_type: string;
  fund_id: string | null;
  parent_account_id: string | null;
  bank_name: string | null;
  created_at: string;
}

interface RawTxnRow {
  id: string;
  bank_account_id: string;
  transaction_date: string | null;
  description: string;
  amount: number | string | null;
  balance: number | string | null;
  match_status: string;
  is_voided: boolean;
  entity_kind: string | null;
  entity_id: string | null;
}

export interface BankAccountRowView {
  id: string;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
  bank_name: string | null;
  fund_labels: string[];
  transactions: Array<{
    id: string;
    date: string | null;
    description: string;
    amount: number | null;
    balance: number | null;
    /** unmatched | auto_matched | manually_matched | excluded. */
    matchStatus: string;
    voided: boolean;
    /** What the manager said this line was for, if anyone has. */
    entity: { kind: EntityKind; id: string } | null;
  }>;
}

/** The things a transaction can be about. */
export type EntityKind = "lot" | "contractor" | "maintenance_request";

export interface EntityOption {
  kind: EntityKind;
  id: string;
  /** The line that identifies it: a person's name, a firm, a job. */
  label: string;
  /** Underneath it: which lot, what trade, where. */
  detail?: string | null;
  /** What the pill on the row says. Shorter than the label, because a
   *  column is not a card: "Lot 3" fits, "Margaret Fitzgerald-Whitmore"
   *  does not. */
  short: string;
}

export interface BankAccountsPageData {
  accounts: BankAccountRowView[];
  /** Everything a line can be assigned to, fetched once for the page rather
   *  than per popover: the list is small and opening a picker should not
   *  cost a round trip. */
  entityOptions: EntityOption[];
}

export async function getBankAccountsPageData(
  ocId: string,
): Promise<BankAccountsPageData> {
  await requireOCAccess(ocId);

  const supabase = createServerClient();
  const [
    { data: accounts },
    { data: funds },
    { data: txns },
    { data: lots },
    { data: contractors },
    { data: jobs },
    { data: lotOwners },
  ] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select(
        "id, account_name, bsb, account_number, fund_type, fund_id, parent_account_id, bank_name, created_at",
      )
      .eq("oc_id", ocId),
    supabase
      .from("funds")
      .select("id, name, kind")
      .eq("oc_id", ocId),
    supabase
      .from("bank_transactions")
      .select(
        "id, bank_account_id, transaction_date, description, amount, balance, match_status, is_voided, entity_kind, entity_id",
      )
      .eq("oc_id", ocId)
      .order("transaction_date", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }),
    // The three things a line can be about. All in the same wave: they are
    // tiny, and the picker has to open instantly or nobody labels anything.
    supabase
      .from("lots")
      .select("id, lot_number, unit_number")
      .eq("oc_id", ocId)
      .order("lot_number", { ascending: true }),
    supabase
      .from("contractors")
      .select("id, name, business_name, company, trade")
      .eq("oc_id", ocId)
      .order("name", { ascending: true }),
    supabase
      .from("maintenance_requests")
      .select("id, reference_number, title, location")
      .eq("oc_id", ocId)
      .order("created_at", { ascending: false }),
    supabase
      .from("v_lot_current_owners")
      .select("lot_id, name")
      .eq("oc_id", ocId),
  ]);

  const allRows = (accounts ?? []) as RawAccountRow[];
  const fundById = new Map(
    ((funds ?? []) as Array<{ id: string; name: string; kind: string }>).map((f) => [f.id, f]),
  );

  // Group by physical account (parent_account_id = null = primary). One
  // row per physical account; list every fund attached.
  const physicalAccounts = allRows.filter((a) => !a.parent_account_id);
  const childrenByParent = new Map<string, RawAccountRow[]>();
  for (const a of allRows) {
    if (!a.parent_account_id) continue;
    if (!childrenByParent.has(a.parent_account_id)) {
      childrenByParent.set(a.parent_account_id, []);
    }
    childrenByParent.get(a.parent_account_id)!.push(a);
  }

  // Stable display order: operating account first; then by created_at.
  // Without this the tabs reorder every time the table is touched (no
  // secondary order key in Postgres) , item 9.
  physicalAccounts.sort((a, b) => {
    const aOp = a.fund_type === "operating" ? 0 : 1;
    const bOp = b.fund_type === "operating" ? 0 : 1;
    if (aOp !== bOp) return aOp - bOp;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  const txnsByAccount = new Map<string, RawTxnRow[]>();
  for (const t of ((txns ?? []) as RawTxnRow[])) {
    if (!txnsByAccount.has(t.bank_account_id)) txnsByAccount.set(t.bank_account_id, []);
    txnsByAccount.get(t.bank_account_id)!.push(t);
  }

  const rows = physicalAccounts.map((primary) => {
    const linkedKids = childrenByParent.get(primary.id) ?? [];
    const fundIds = [primary.fund_id, ...linkedKids.map((k) => k.fund_id)]
      .filter((id): id is string => !!id);
    const fundLabels = fundIds
      .map((id) => fundById.get(id)?.name)
      .filter((n): n is string => !!n);
    const accountTxns = (txnsByAccount.get(primary.id) ?? []).map((t) => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description,
      amount: t.amount !== null ? Number(t.amount) : null,
      balance: t.balance !== null ? Number(t.balance) : null,
      matchStatus: t.match_status,
      voided: t.is_voided,
      entity:
        t.entity_kind && t.entity_id
          ? { kind: t.entity_kind as EntityKind, id: t.entity_id }
          : null,
    }));
    return {
      id: primary.id,
      account_name: primary.account_name,
      bsb: primary.bsb,
      account_number: primary.account_number,
      bank_name: primary.bank_name,
      fund_labels: Array.from(new Set(fundLabels)).sort(),
      transactions: accountTxns,
    };
  });

  // One flat list, tagged by kind. The picker groups it; the ledger looks a
  // row up in it by id, so a label never needs its own query.
  const ownerByLot = new Map(
    ((lotOwners ?? []) as Array<{ lot_id: string; name: string | null }>).map(
      (o) => [o.lot_id, o.name],
    ),
  );
  const entityOptions: EntityOption[] = [
    ...((lots ?? []) as Array<{ id: string; lot_number: number; unit_number: string | null }>)
      .map((l) => {
        const where = `Lot ${l.lot_number}${l.unit_number ? ` · Unit ${l.unit_number}` : ""}`;
        const owner = ownerByLot.get(l.id) ?? null;
        // The person first, because a manager reconciling a receipt is
        // looking for the name on it. The lot underneath, because that is
        // what the name means here. An unowned lot has only the one line.
        return {
          kind: "lot" as const,
          id: l.id,
          label: owner ?? where,
          detail: owner ? where : null,
          short: where,
        };
      }),
    ...((contractors ?? []) as Array<{
      id: string; name: string | null; business_name: string | null;
      company: string | null; trade: string | null;
    }>).map((c) => {
      const name = c.business_name || c.company || c.name || "Contractor";
      return {
        kind: "contractor" as const,
        id: c.id,
        label: name,
        detail: c.trade,
        short: name,
      };
    }),
    ...((jobs ?? []) as Array<{
      id: string; reference_number: string | null; title: string | null; location: string | null;
    }>).map((j) => {
      const name = j.title || j.reference_number || "Maintenance job";
      return {
        kind: "maintenance_request" as const,
        id: j.id,
        label: name,
        detail: j.location,
        short: name,
      };
    }),
  ];

  return { accounts: rows, entityOptions };
}
