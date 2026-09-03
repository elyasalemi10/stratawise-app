"use server";

import { getOC, getOCStats } from "@/lib/actions/oc";
import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { getLotBalances, sumBalances } from "@/lib/lot-balance";

// One aggregate fetch for the OC overview.
//
// The two roles see completely different pages, so this returns a
// discriminated union and only the queries for the role that asked go out.
//
// The auth check lives here, not in page.tsx: page.tsx only runs on the
// initial shell request, so a check left up there would be skipped on every
// refresh the client drives afterwards.

export interface OwnerOverviewData {
  kind: "owner";
  setupIncomplete: false;
  levies: Array<{
    id: string;
    lot_id: string;
    reference_number: string;
    period_start: string;
    period_end: string;
    amount: number | null;
    status: string;
    due_date: string;
    pdf_url: string | null;
  }>;
  totalLevied: number;
  outstanding: number;
  hasLots: boolean;
}

export interface ManagerOverviewData {
  kind: "manager";
  setupIncomplete: boolean;
  /** Wizard step to resume on, only meaningful when setupIncomplete. */
  resumeStep: number;
  stats: Awaited<ReturnType<typeof getOCStats>> | null;
}

export type OCOverviewData = OwnerOverviewData | ManagerOverviewData;

export async function getOCOverviewData(ocId: string): Promise<OCOverviewData> {
  const profile = await requireOCAccess(ocId);
  const oc = await getOC(ocId);

  if (profile.role !== "lot_owner") {
    // Setup incomplete: the page is a "continue setup" prompt, so there is
    // no point paying for the stats query.
    if (oc && (oc.setup_step ?? 0) < 5) {
      return {
        kind: "manager",
        setupIncomplete: true,
        resumeStep: (oc.setup_step ?? 0) + 1,
        stats: null,
      };
    }
    return {
      kind: "manager",
      setupIncomplete: false,
      resumeStep: 0,
      stats: await getOCStats(ocId),
    };
  }

  const supabase = createServerClient();

  const { data: memberships } = await supabase
    .from("v_lot_current_owners")
    .select("lot_id")
    .eq("oc_id", ocId)
    .eq("profile_id", profile.id);

  const lotIds = (memberships ?? []).map((m) => m.lot_id).filter(Boolean) as string[];
  if (lotIds.length === 0) {
    return {
      kind: "owner",
      setupIncomplete: false,
      levies: [],
      totalLevied: 0,
      outstanding: 0,
      hasLots: false,
    };
  }

  const { data: levies } = await supabase
    .from("levy_notices")
    .select(
      "id, lot_id, reference_number, period_start, period_end, amount, status, due_date, pdf_url",
    )
    .in("lot_id", lotIds)
    .in("status", ["issued", "partially_paid", "paid", "overdue"])
    .order("due_date", { ascending: false });

  // The list above is filtered to display statuses (it includes paid ones so
  // the owner can see their history), so it cannot double as the arrears
  // figure. getLotBalances is the one definition of what a lot owes, and it
  // includes the opening balance , which this screen used to leave out while
  // the manager's view of the same lot included it.
  const balances = await getLotBalances(supabase, lotIds);
  const totals = sumBalances(balances.values());

  return {
    kind: "owner",
    setupIncomplete: false,
    levies: levies ?? [],
    totalLevied: totals.opening + totals.levied,
    outstanding: totals.balance,
    hasLots: true,
  };
}
