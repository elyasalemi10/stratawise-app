"use server";

import { unstable_cache, updateTag } from "next/cache";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { countLotsWithOwner, getLotOwners, type LotOwnerStatus } from "@/lib/actions/lot-ownership";

/**
 * Call at the tail of every mutation server action that affects the sidebar
 * unmatched count (bank_transactions / reconciliation_matches /
 * undeposited_funds_entries). Performs one indexed lookup to resolve the
 * oc's company_id, then revalidates the matching cache tag.
 * Client-side invalidation of localStorage + the sidebar re-fetch is the
 * caller's responsibility (see sidebar-cache.ts#revalidateSidebarFromClient).
 */
export async function revalidateSidebarForOC(ocId: string): Promise<void> {
  const sb = createServerClient();
  const { data } = await sb
    .from("owners_corporations")
    .select("management_company_id")
    .eq("id", ocId)
    .single();
  if (data?.management_company_id) {
    // Next.js 16: updateTag is the server-action-side API with
    // read-your-own-writes semantics (revalidateTag gained a second
    // required arg and is intended for route revalidation).
    updateTag(`sidebar-ocs-${data.management_company_id}`);
  }
}

export interface SidebarLot {
  lot_number: number;
  unit_number: string | null;
}

export interface SidebarOC {
  id: string;
  /** Discriminator: "active" rows live in owners_corporations and own a
   *  short_code; "draft" rows live in oc_drafts and own a current_step
   *  pointing to where the wizard left off. Drafts surface in the swapper
   *  but never on the count badge. */
  kind: "active" | "draft";
  short_code: string;
  name: string;
  address: string;
  plan_number: string;
  total_lots: number;
  status: string;
  /** Wizard step the draft was last on. Only set when kind === "draft". */
  draft_step?: number;
  lots?: SidebarLot[];
  /**
   * Count of bank transactions in this oc awaiting manager
   * reconciliation. Computed on sidebar load — becomes stale after in-session
   * match/exclude/void actions until the next sidebar remount. Acceptable
   * for MVP; tighter staleness handling is a Prompt 7 polish item.
   * Lot-owner role: always 0 (not shown).
   */
  unmatched_count?: number;
}

export async function getSidebarOCs(): Promise<SidebarOC[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];

  const supabase = createServerClient();

  if (profile.role === "super_admin" || profile.role === "strata_manager") {
    if (!profile.management_company_id) return [];
    const companyId = profile.management_company_id;

    // The per-company fetch is tagged via unstable_cache. Every reconciliation
    // mutation (match, unmatch, exclude/unexclude, receipt, deposit, void,
    // CSV import, manual-txn add) calls revalidateSidebarForOC(), which
    // resolves company_id and invokes Next.js 16 updateTag() on this cache tag
    // for read-your-own-writes semantics. The client also clears localStorage
    // (sidebar-cache.ts) and re-fetches on the "stratawise-sidebar:refresh" event.
    //
    // Deliberate trade-off on query count:
    // - +2 supabase queries on sidebar mount (bank_accounts fan-out + unmatched
    //   bank_transactions scan), aggregated in JS (Supabase JS has no GROUP BY).
    // - Zero extra queries per navigation — the whole result is wrapped in
    //   unstable_cache + served from localStorage on the client for up to 5
    //   minutes (see sidebar-cache.ts).
    // Do NOT "optimise" this without understanding the cache pattern. Trying
    // to count in a single SQL statement without a supporting RPC removes the
    // cache-tag invalidation seam we rely on here.
    const fetchForCompany = unstable_cache(
      async (cid: string): Promise<SidebarOC[]> => {
        const sb = createServerClient();
        const { data: subs } = await sb
          .from("owners_corporations")
          .select("id, short_code, name, address, plan_number, total_lots, status")
          .eq("management_company_id", cid)
          .eq("status", "active")
          .order("name");
        const subRows = subs ?? [];
        if (subRows.length === 0) return [];

        const subIds = subRows.map((s) => s.id);
        const { data: accounts } = await sb
          .from("bank_accounts")
          .select("id, oc_id")
          .in("oc_id", subIds);
        const accountToSub = new Map<string, string>();
        for (const a of accounts ?? []) accountToSub.set(a.id, a.oc_id);

        const accountIds = Array.from(accountToSub.keys());
        const countBySub = new Map<string, number>();
        if (accountIds.length > 0) {
          const { data: unmatchedRows } = await sb
            .from("bank_transactions")
            .select("bank_account_id")
            .in("bank_account_id", accountIds)
            .eq("is_voided", false)
            .eq("match_status", "unmatched");
          for (const row of unmatchedRows ?? []) {
            const sid = accountToSub.get(row.bank_account_id);
            if (!sid) continue;
            countBySub.set(sid, (countBySub.get(sid) ?? 0) + 1);
          }
        }

        const active: SidebarOC[] = subRows.map((s) => ({
          ...s,
          kind: "active" as const,
          address: s.address ?? "",
          unmatched_count: countBySub.get(s.id) ?? 0,
        }));

        // Drafts the user started but didn't complete. Sorted oldest-first
        // so picking up an old draft is the natural action; drafts appended
        // AFTER active OCs in the swapper but the count badge ignores them.
        // promoted_oc_id IS NULL = the wizard never finished. We don't want
        // already-promoted draft rows reappearing alongside the real OC they
        // produced.
        const { data: drafts } = await sb
          .from("oc_drafts")
          .select("id, current_step, draft_json, plan_filename")
          .eq("management_company_id", cid)
          .is("promoted_oc_id", null)
          .order("updated_at", { ascending: false });
        const draftRows: SidebarOC[] = (drafts ?? []).map((d) => {
          const draftJson = (d.draft_json ?? {}) as {
            oc_name?: string;
            plan_number?: string;
            address?: string;
            total_lots?: number;
          };
          const planNumber = draftJson.plan_number ?? "";
          // Best-effort label: prefer the OC name typed by the user, then the
          // plan number, then the uploaded filename. Always prefixed "Draft:".
          const labelGuess = draftJson.oc_name?.trim() ||
            (planNumber ? `Owners Corporation ${planNumber}` : null) ||
            d.plan_filename?.replace(/\.pdf$/i, "") ||
            "Untitled draft";
          return {
            id: d.id,
            kind: "draft" as const,
            short_code: "",
            name: `Draft: ${labelGuess}`,
            address: draftJson.address ?? "",
            plan_number: planNumber,
            total_lots: draftJson.total_lots ?? 0,
            status: "draft",
            draft_step: d.current_step ?? 1,
          };
        });

        return [...active, ...draftRows];
      },
      [`sidebar-ocs`],
      { tags: [`sidebar-ocs-${companyId}`] },
    );

    return fetchForCompany(companyId);
  }

  // lot_owner — ocs they're a member of, with their lot info
  const { data: memberships } = await supabase
    .from("oc_members")
    .select("oc_id, lot_id")
    .eq("profile_id", profile.id)
    .is("left_at", null);

  if (!memberships || memberships.length === 0) return [];

  const ids = [...new Set(memberships.map((m) => m.oc_id))];
  const lotIds = memberships.map((m) => m.lot_id).filter(Boolean) as string[];

  const [subsResult, lotsResult] = await Promise.all([
    supabase
      .from("owners_corporations")
      .select("id, short_code, name, address, plan_number, total_lots, status")
      .in("id", ids)
      .eq("status", "active")
      .order("name"),
    lotIds.length > 0
      ? supabase.from("lots").select("id, oc_id, lot_number, unit_number").in("id", lotIds)
      : Promise.resolve({ data: [] }),
  ]);

  const lotsMap = new Map<string, SidebarLot[]>();
  (lotsResult.data ?? []).forEach((lot) => {
    const existing = lotsMap.get(lot.oc_id) ?? [];
    existing.push({ lot_number: lot.lot_number, unit_number: lot.unit_number });
    lotsMap.set(lot.oc_id, existing);
  });

  return (subsResult.data ?? []).map((s) => ({
    ...s,
    kind: "active" as const,
    address: s.address ?? "",
    lots: lotsMap.get(s.id) ?? [],
  }));
}

export async function getOC(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("owners_corporations")
    .select("*")
    .eq("id", ocId)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getOCStats(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const [lotsResult, membersResult, leviesResult, paymentsResult] = await Promise.all([
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("oc_id", ocId),
    supabase
      .from("oc_members")
      .select("id", { count: "exact", head: true })
      .eq("oc_id", ocId)
      .is("left_at", null),
    supabase
      .from("levy_notices")
      .select("amount")
      .eq("oc_id", ocId)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("amount")
      .eq("oc_id", ocId),
  ]);

  const totalLevied = leviesResult.data?.reduce((sum, l) => sum + Number(l.amount), 0) ?? 0;
  const totalPaid = paymentsResult.data?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;

  return {
    totalLots: lotsResult.count ?? 0,
    totalMembers: membersResult.count ?? 0,
    totalLevied,
    totalPaid,
    outstanding: totalLevied - totalPaid,
  };
}

export interface LotWithFinancials {
  id: string;
  lot_number: number;
  lot_entitlement: number;
  lot_liability: number;
  unit_number: string | null;
  owner_display_name: string | null;
  owner_contact_email: string | null;
  owner_contact_phone: string | null;
  owner_status: LotOwnerStatus;
  balance: number;
  financial_status: "up_to_date" | "unassigned" | "behind";
}

export async function getLotsWithFinancials(ocId: string): Promise<LotWithFinancials[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: lots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, lot_entitlement, lot_liability")
    .eq("oc_id", ocId)
    .order("lot_number");

  if (!lots) return [];

  const lotIds = lots.map((l) => l.id);

  const [leviesResult, paymentsResult, owners] = await Promise.all([
    supabase
      .from("levy_notices")
      .select("lot_id, amount")
      .in("lot_id", lotIds)
      .in("status", ["issued", "partially_paid", "overdue"]),
    supabase
      .from("payments")
      .select("lot_id, amount")
      .in("lot_id", lotIds),
    getLotOwners(supabase, lotIds),
  ]);

  const leviesByLot = new Map<string, number>();
  const paymentsByLot = new Map<string, number>();

  leviesResult.data?.forEach((l) => {
    leviesByLot.set(l.lot_id, (leviesByLot.get(l.lot_id) ?? 0) + Number(l.amount));
  });
  paymentsResult.data?.forEach((p) => {
    paymentsByLot.set(p.lot_id, (paymentsByLot.get(p.lot_id) ?? 0) + Number(p.amount));
  });

  return lots.map((lot) => {
    const totalLevied = leviesByLot.get(lot.id) ?? 0;
    const totalPaid = paymentsByLot.get(lot.id) ?? 0;
    const balance = totalLevied - totalPaid;
    const owner = owners.get(lot.id);
    const isAssigned = owner?.owner_status === "member";

    let financial_status: "up_to_date" | "unassigned" | "behind";
    if (!isAssigned) {
      financial_status = "unassigned";
    } else if (balance > 0) {
      financial_status = "behind";
    } else {
      financial_status = "up_to_date";
    }

    return {
      id: lot.id,
      lot_number: lot.lot_number,
      lot_entitlement: Number(lot.lot_entitlement),
      lot_liability: Number(lot.lot_liability),
      unit_number: lot.unit_number,
      owner_display_name: owner?.owner_display_name ?? null,
      owner_contact_email: owner?.owner_contact_email ?? null,
      owner_contact_phone: owner?.owner_contact_phone ?? null,
      owner_status: owner?.owner_status ?? "unowned",
      balance,
      financial_status,
    };
  });
}

export async function getOCManageStats(ocId: string) {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const [lotsResult, ownersAssignedCount, membersResult] = await Promise.all([
    supabase
      .from("lots")
      .select("id", { count: "exact", head: true })
      .eq("oc_id", ocId),
    countLotsWithOwner(supabase, ocId),
    supabase
      .from("oc_members")
      .select("id", { count: "exact", head: true })
      .eq("oc_id", ocId)
      .is("left_at", null),
  ]);

  return {
    totalLots: lotsResult.count ?? 0,
    ownersAssigned: ownersAssignedCount,
    totalMembers: membersResult.count ?? 0,
  };
}

export async function getCompanyOCSummary() {
  const profile = await getCurrentProfile();
  if (!profile?.management_company_id) return null;

  const supabase = createServerClient();

  const { data: ocs, count } = await supabase
    .from("owners_corporations")
    .select("id, short_code, name, plan_number, address, total_lots, status, created_at", { count: "exact" })
    .eq("management_company_id", profile.management_company_id)
    .eq("status", "active")
    .order("name");

  const totalLots = ocs?.reduce((sum, s) => sum + (s.total_lots ?? 0), 0) ?? 0;

  return {
    ocs: ocs ?? [],
    totalOCs: count ?? 0,
    totalLots,
  };
}
