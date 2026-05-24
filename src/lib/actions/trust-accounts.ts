"use server";

import { z } from "zod";
import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { DEFAULT_TRUST_COA } from "@/lib/trust-accounting/coa-seed";

// Phase 1 trust accounting actions , list firm trust accounts, create a
// new one (and seed the chart-of-accounts the first time the firm picks
// up a trust account), archive / restore. Statement upload + match queue
// land in phase 2.

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface TrustAccountRow {
  id: string;
  name: string;
  bank_name: string | null;
  bsb: string | null;
  account_number: string | null;
  is_default: boolean;
  created_at: string;
  // Phase-2 fields surfaced now so the UI can show counts even though
  // ingest hasn't shipped , both default to 0 / null.
  needs_review_count: number;
  last_statement_at: string | null;
}

export async function listTrustAccounts(): Promise<TrustAccountRow[]> {
  const profile = await requireCompanyRole();
  if (!profile.management_company_id) return [];
  const supabase = createServerClient();

  const { data: accounts } = await supabase
    .from("trust_accounts")
    .select("id, name, bank_name, bsb, account_number, is_default, created_at")
    .eq("management_company_id", profile.management_company_id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (accounts ?? []) as Array<{
    id: string;
    name: string;
    bank_name: string | null;
    bsb: string | null;
    account_number: string | null;
    is_default: boolean;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  // Per-account counts of unreconciled transactions + latest statement
  // date. Empty for phase 1 since no transactions exist yet , phase 2's
  // upload pipeline writes them.
  const ids = rows.map((r) => r.id);
  const { data: counts } = await supabase
    .from("trust_transactions")
    .select("trust_account_id, status, txn_date")
    .in("trust_account_id", ids);

  const reviewCount = new Map<string, number>();
  const latestDate = new Map<string, string>();
  for (const t of (counts ?? []) as Array<{ trust_account_id: string; status: string; txn_date: string }>) {
    if (t.status === "needs_review") {
      reviewCount.set(t.trust_account_id, (reviewCount.get(t.trust_account_id) ?? 0) + 1);
    }
    const prev = latestDate.get(t.trust_account_id);
    if (!prev || t.txn_date > prev) latestDate.set(t.trust_account_id, t.txn_date);
  }

  return rows.map((r) => ({
    ...r,
    needs_review_count: reviewCount.get(r.id) ?? 0,
    last_statement_at: latestDate.get(r.id) ?? null,
  }));
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  bank_name: z.string().trim().max(80).optional().transform((v) => v || null),
  bsb: z
    .string()
    .trim()
    .max(7)
    .optional()
    .transform((v) => v?.replace(/\s|-/g, "") || null)
    .refine((v) => v === null || /^\d{6}$/.test(v), {
      message: "BSB must be 6 digits",
    }),
  account_number: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v?.replace(/\s|-/g, "") || null)
    .refine((v) => v === null || /^\d{4,12}$/.test(v), {
      message: "Account number must be 4-12 digits",
    }),
  is_default: z.boolean().optional().default(false),
});

export async function createTrustAccount(
  input: z.input<typeof createSchema>,
): Promise<Result<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const profile = await requireCompanyRole(["admin"]);
  if (!profile.management_company_id) return { ok: false, error: "Not in a firm" };

  const supabase = createServerClient();

  // If is_default = true, clear any existing default first so only one
  // account flies the default flag at a time.
  if (parsed.data.is_default) {
    await supabase
      .from("trust_accounts")
      .update({ is_default: false })
      .eq("management_company_id", profile.management_company_id)
      .eq("is_default", true);
  }

  const { data: row, error } = await supabase
    .from("trust_accounts")
    .insert({
      management_company_id: profile.management_company_id,
      name: parsed.data.name,
      bank_name: parsed.data.bank_name,
      bsb: parsed.data.bsb,
      account_number: parsed.data.account_number,
      is_default: parsed.data.is_default,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "Insert failed" };

  // First trust account for this firm? Seed the default chart of
  // accounts so the upload pipeline has somewhere to tag against from
  // day one.
  const { count: existingCoaCount } = await supabase
    .from("trust_chart_of_accounts")
    .select("id", { count: "exact", head: true })
    .eq("management_company_id", profile.management_company_id);

  if ((existingCoaCount ?? 0) === 0) {
    await supabase.from("trust_chart_of_accounts").insert(
      DEFAULT_TRUST_COA.map((c) => ({
        management_company_id: profile.management_company_id,
        code: c.code,
        label: c.label,
        kind: c.kind,
        is_system: true,
      })),
    );
  }

  await logAudit({
    profileId: profile.id,
    action: "create",
    entityType: "trust_account",
    entityId: row.id as string,
    after: {
      name: parsed.data.name,
      bank_name: parsed.data.bank_name,
      bsb: parsed.data.bsb,
      is_default: parsed.data.is_default,
    },
  });

  return { ok: true, data: { id: row.id as string } };
}

export interface ChartOfAccountsRow {
  id: string;
  code: string;
  label: string;
  kind: "income" | "expense" | "transfer";
  is_system: boolean;
  archived_at: string | null;
}

export async function listChartOfAccounts(): Promise<ChartOfAccountsRow[]> {
  const profile = await requireCompanyRole();
  if (!profile.management_company_id) return [];
  const supabase = createServerClient();
  const { data } = await supabase
    .from("trust_chart_of_accounts")
    .select("id, code, label, kind, is_system, archived_at")
    .eq("management_company_id", profile.management_company_id)
    .order("kind", { ascending: true })
    .order("label", { ascending: true });
  return (data ?? []) as ChartOfAccountsRow[];
}
