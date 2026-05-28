"use server";

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

// Levy notices issued against a lot. Returned ordered most-recent first by
// due_date so the Levies tab matches the order managers naturally scan
// (newest at the top). Paid/unpaid is read from row.status; amount_paid is
// the running total assigned to this notice , see project context for the
// per-notice payment assignment design (vs. a balance-only model).

export interface LotLevyRow {
  id: string;
  /** Owner-facing reference: DRN if active, else lot_owners.payment_reference.
   *  Internal LEV-NNNN is never surfaced here. */
  display_reference: string;
  fund_type: "operating" | "maintenance_plan";
  levy_type: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  status:
    | "draft"
    | "issued"
    | "partially_paid"
    | "paid"
    | "overdue"
    | "cancelled"
    | "written_off";
  pdf_url: string | null;
  issued_at: string | null;
  paid_at: string | null;
}

export async function listLotLevies(lotId: string): Promise<LotLevyRow[]> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const [{ data, error }, { data: drns }, { data: ownerRefRow }] = await Promise.all([
    supabase
      .from("levy_notices")
      .select(
        "id, fund_type, levy_type, period_start, period_end, due_date, amount, amount_paid, status, pdf_url, issued_at, paid_at",
      )
      .eq("lot_id", lotId)
      // Hide drafts , the owner never sees a notice that hasn't gone out,
      // and listing them on the lot detail confuses managers reviewing what
      // an owner owes.
      .neq("status", "draft")
      .order("due_date", { ascending: false })
      .limit(500),
    supabase
      .from("lot_drns")
      .select("drn, active_from, active_to")
      .eq("lot_id", lotId)
      .order("active_from", { ascending: false }),
    supabase
      .from("lot_owners")
      .select("payment_reference")
      .eq("lot_id", lotId)
      .not("payment_reference", "is", null)
      .limit(1)
      .maybeSingle(),
  ]);

  if (error || !data) return [];
  const drnRows = (drns ?? []) as Array<{ drn: string; active_from: string; active_to: string | null }>;
  const ownerRef = (ownerRefRow as { payment_reference: string | null } | null)?.payment_reference ?? null;

  function refForPeriod(periodStart: string): string {
    const active = drnRows.find(
      (d) => d.active_from <= periodStart && (!d.active_to || d.active_to >= periodStart),
    );
    return active?.drn ?? ownerRef ?? "";
  }

  return data.map((row) => ({
    id: row.id as string,
    display_reference: refForPeriod(row.period_start as string),
    fund_type: row.fund_type as LotLevyRow["fund_type"],
    levy_type: row.levy_type as string,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    due_date: row.due_date as string,
    amount: Number(row.amount),
    amount_paid: Number(row.amount_paid ?? 0),
    status: row.status as LotLevyRow["status"],
    pdf_url: (row.pdf_url as string | null) ?? null,
    issued_at: (row.issued_at as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
  }));
}
