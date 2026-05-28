"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface BudgetCategory {
  id: string;
  code: string;
  name: string;
  fund_type: "operating" | "maintenance_plan";
  sort_order: number;
}

export type BudgetFundType = "operating" | "maintenance_plan";

export interface BudgetItemData {
  // Either references a legacy budget_categories row (back-compat) or , for
  // new budgets , references a chart_of_accounts row via coa_account_id.
  category_id?: string | null;
  coa_account_id?: string | null;
  description: string;
  amount: number;
  /** Which fund this line item is for. Required for new multi-fund budgets;
   *  back-compat path leaves it null and inherits from the parent budget's
   *  legacy fund_type column. */
  fund_type?: BudgetFundType;
  /** Custom-fund items set this in addition to fund_type=operating
   *  (placeholder for the NOT NULL enum). The new fund_id FK is the
   *  source of truth for downstream code. */
  fund_id?: string;
}

export interface BudgetWithItems {
  id: string;
  oc_id: string;
  financial_year: string;
  /** Legacy single-fund column. Null on new multi-fund budgets. */
  fund_type: BudgetFundType | null;
  /** Every fund this budget touches. For single-fund budgets this is a
   *  one-element array; for multi-fund budgets it lists every fund the items
   *  cover. Source of truth going forward. */
  fund_types: BudgetFundType[];
  total_amount: number;
  status: "draft" | "approved";
  approved_at: string | null;
  approval_note: string | null;
  /** Free-text description shown in the budgets list. Optional. */
  description?: string | null;
  items: {
    id: string;
    category_id: string | null;
    coa_account_id: string | null;
    category_name: string;
    description: string | null;
    amount: number;
    sort_order: number;
    /** Per-item fund tag. New writes always set this; old rows are
     *  backfilled from the parent budget's fund_type. */
    fund_type: BudgetFundType | null;
    /** Custom-fund items carry a fund_id FK; admin/maintenance items
     *  leave this null and rely on fund_type alone. */
    fund_id: string | null;
  }[];
}

// True when the OC has a maintenance-plan fund (a bank_accounts row with
// fund_type='maintenance_plan'). Drives whether the budget form offers a
// maintenance budget at all.
export async function ocHasMaintenanceFund(ocId: string): Promise<boolean> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();
  const { count } = await supabase
    .from("bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("oc_id", ocId)
    .eq("fund_type", "maintenance_plan");
  return (count ?? 0) > 0;
}

export async function getBudgetCategories(): Promise<BudgetCategory[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("budget_categories")
    .select("id, code, name, fund_type, sort_order")
    .order("sort_order");
  return data ?? [];
}

export async function createBudgetCategory(
  name: string,
  fundType: "operating" | "maintenance_plan"
): Promise<{ id: string; error?: string }> {
  await requireCompanyRole();
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 120) {
    return { id: "", error: "Category name is required and must be under 120 characters." };
  }
  const supabase = createServerClient();

  // Check if it already exists
  const { data: existing } = await supabase
    .from("budget_categories")
    .select("id")
    .eq("name", trimmed)
    .eq("fund_type", fundType)
    .single();

  if (existing) return { id: existing.id };

  // Get max sort order for this fund type
  const { data: maxSort } = await supabase
    .from("budget_categories")
    .select("sort_order")
    .eq("fund_type", fundType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sortOrder = (maxSort?.sort_order ?? 0) + 1;
  const code = `${fundType === "operating" ? "2" : "3"}99${String(sortOrder).padStart(3, "0")}`;

  const { data: newCat, error } = await supabase
    .from("budget_categories")
    .insert({ code, name: trimmed, fund_type: fundType, sort_order: sortOrder })
    .select("id")
    .single();

  if (error) return { id: "", error: error.message };
  return { id: newCat.id };
}

export async function getOCBudgets(ocId: string): Promise<BudgetWithItems[]> {
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("oc_id", ocId)
    .order("financial_year", { ascending: false });

  if (!budgets || budgets.length === 0) return [];

  const budgetIds = budgets.map((b) => b.id);
  // LEFT JOIN both old (budget_categories) and new (chart_of_accounts) FKs so
  // legacy items render alongside CoA-backed ones during the transition.
  // The generated Supabase types occasionally collapse multi-FK selects to a
  // generic error tuple; cast through `unknown` so the runtime shape we expect
  // wins (the runtime IS correct , only the inferred type is off).
  type RawItem = {
    id: string;
    budget_id: string;
    category_id: string | null;
    coa_account_id: string | null;
    description: string | null;
    amount: number;
    sort_order: number;
    fund_type: BudgetFundType | null;
    fund_id: string | null;
    budget_categories: { name: string } | null;
    chart_of_accounts: { name: string; code: string } | null;
  };
  const { data: rawItems } = await supabase
    .from("budget_items")
    .select(
      "id, budget_id, category_id, coa_account_id, description, amount, sort_order, fund_type, fund_id, " +
      "budget_categories(name), chart_of_accounts(name, code)"
    )
    .in("budget_id", budgetIds)
    .order("sort_order");
  const items = (rawItems ?? []) as unknown as RawItem[];

  return budgets.map((b) => ({
    ...b,
    fund_types: (b.fund_types ?? (b.fund_type ? [b.fund_type] : [])) as BudgetFundType[],
    description: (b as { description?: string | null }).description ?? null,
    items: items
      .filter((i) => i.budget_id === b.id)
      .map((i) => ({
        id: i.id,
        category_id: i.category_id,
        coa_account_id: i.coa_account_id,
        category_name: i.chart_of_accounts?.name ?? i.budget_categories?.name ?? "",
        description: i.description,
        amount: Number(i.amount),
        sort_order: i.sort_order,
        fund_type: i.fund_type ?? (b.fund_type as BudgetFundType | null),
        fund_id: i.fund_id,
      })),
  })) as BudgetWithItems[];
}

export async function createBudget(
  ocId: string,
  data: {
    financial_year: string;
    /** Every system fund the budget touches (admin / cw / mp). Required at
     *  least one of fund_types OR fund_ids must be present. */
    fund_types: BudgetFundType[];
    /** Custom funds (via the new funds table) the budget touches. Items
     *  belonging to a custom fund set fund_id and leave fund_type at the
     *  legacy "operating" placeholder so the enum constraint stays
     *  satisfied. */
    fund_ids?: string[];
    items: BudgetItemData[];
    /** Optional free-text description shown in the budgets list table. */
    description?: string | null;
  }
) {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const customFundIds = Array.from(new Set(data.fund_ids ?? []));
  if (!data.fund_types?.length && customFundIds.length === 0) {
    return { error: "Pick at least one fund." };
  }
  const fundTypes = Array.from(new Set(data.fund_types));

  // One budget per OC per financial year now , funds are stored on items.
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("oc_id", ocId)
    .eq("financial_year", data.financial_year)
    .maybeSingle();
  if (existing) {
    return { error: `A budget for ${data.financial_year} already exists. Edit it instead.` };
  }

  const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

  // Legacy fund_type column is set to the SINGLE fund when there's only one
  // (back-compat with the per-fund levy generation path); null otherwise.
  const legacyFundType = fundTypes.length === 1 ? fundTypes[0] : null;

  // For budgets that ONLY touch a single custom fund (no system funds),
  // the legacy fund_type column needs a value to satisfy old read paths
  // , set it to operating as a placeholder; downstream code now
  // reads fund_id when present.
  const headerFundId = customFundIds.length === 1 && fundTypes.length === 0
    ? customFundIds[0]
    : null;

  const { data: budget, error } = await supabase
    .from("budgets")
    .insert({
      oc_id: ocId,
      financial_year: data.financial_year,
      fund_type: legacyFundType ?? (customFundIds.length > 0 ? "operating" : null),
      fund_types: fundTypes,
      fund_id: headerFundId,
      total_amount: totalAmount,
      status: "draft",
      description: data.description?.trim() || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const itemInserts = data.items
    .filter((item) => item.amount > 0)
    .map((item, i) => ({
      budget_id: budget.id,
      category_id: item.coa_account_id ? null : (item.category_id ?? null),
      coa_account_id: item.coa_account_id ?? null,
      description: item.description || null,
      amount: item.amount,
      // For multi-fund budgets every item MUST carry its own fund_type. Custom
      // funds set fund_id and leave fund_type at the legacy "operating"
      // placeholder so the NOT NULL enum constraint stays satisfied; reads
      // prefer fund_id when present.
      fund_type: item.fund_type ?? legacyFundType ?? (item.fund_id ? "operating" : null),
      fund_id: item.fund_id ?? null,
      sort_order: i,
    }));

  if (itemInserts.length > 0) {
    const { error: itemError } = await supabase.from("budget_items").insert(itemInserts);
    if (itemError) return { error: itemError.message };
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "budget",
    entity_id: budget.id,
    after_state: { financial_year: data.financial_year, fund_types: fundTypes, total_amount: totalAmount },
  });

  revalidatePath("/ocs/[ocCode]/manage", "page");
  revalidatePath("/ocs/[ocCode]/budgets", "page");

  return { success: true, budgetId: budget.id };
}

export async function getBudgetById(budgetId: string): Promise<BudgetWithItems | null> {
  const supabase = createServerClient();
  const { data: budget } = await supabase
    .from("budgets")
    .select("*")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget) return null;
  await requireOCAccess(budget.oc_id);

  type RawItem = {
    id: string;
    category_id: string | null;
    coa_account_id: string | null;
    description: string | null;
    amount: number;
    sort_order: number;
    fund_type: BudgetFundType | null;
    budget_categories: { name: string } | null;
    chart_of_accounts: { name: string; code: string } | null;
  };
  const { data: rawItems } = await supabase
    .from("budget_items")
    .select(
      "id, category_id, coa_account_id, description, amount, sort_order, fund_type, " +
      "budget_categories(name), chart_of_accounts(name, code)"
    )
    .eq("budget_id", budgetId)
    .order("sort_order");
  const items = (rawItems ?? []) as unknown as RawItem[];

  return {
    ...budget,
    fund_types: (budget.fund_types ?? (budget.fund_type ? [budget.fund_type] : [])) as BudgetFundType[],
    items: items.map((i) => ({
      id: i.id,
      category_id: i.category_id,
      coa_account_id: i.coa_account_id,
      category_name: i.chart_of_accounts?.name ?? i.budget_categories?.name ?? "",
      description: i.description,
      amount: Number(i.amount),
      sort_order: i.sort_order,
      fund_type: i.fund_type ?? (budget.fund_type as BudgetFundType | null),
    })),
  } as BudgetWithItems;
}

export async function deleteBudget(budgetId: string): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();
  const { data: budget } = await supabase
    .from("budgets")
    .select("id, oc_id, status")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget) return { error: "Budget not found." };
  await requireOCAccess(budget.oc_id);

  if (budget.status === "approved") {
    return { error: "Approved budgets can't be deleted. Create a new budget instead." };
  }

  await supabase.from("budget_items").delete().eq("budget_id", budgetId);
  const { error } = await supabase.from("budgets").delete().eq("id", budgetId);
  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: budget.oc_id,
    action: "delete",
    entity_type: "budget",
    entity_id: budgetId,
  });

  revalidatePath("/ocs/[ocCode]/budgets", "page");
  revalidatePath("/ocs/[ocCode]/manage", "page");
  return {};
}

export async function updateBudgetItems(
  budgetId: string,
  items: BudgetItemData[],
): Promise<{ error?: string }> {
  const profile = await requireCompanyRole();
  const supabase = createServerClient();

  const { data: budget } = await supabase
    .from("budgets")
    .select("id, oc_id, status")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget) return { error: "Budget not found." };
  await requireOCAccess(budget.oc_id);
  if (budget.status === "approved") {
    return { error: "Approved budgets can't be edited. Delete and recreate if you need changes." };
  }

  const nonZero = items.filter((i) => i.amount > 0);
  const totalAmount = nonZero.reduce((s, i) => s + i.amount, 0);

  // Wipe + reinsert , simplest and safe since the budget is still draft.
  const { error: delErr } = await supabase.from("budget_items").delete().eq("budget_id", budgetId);
  if (delErr) return { error: delErr.message };

  if (nonZero.length > 0) {
    const inserts = nonZero.map((item, i) => ({
      budget_id: budgetId,
      category_id: item.coa_account_id ? null : (item.category_id ?? null),
      coa_account_id: item.coa_account_id ?? null,
      description: item.description || null,
      amount: item.amount,
      fund_type: item.fund_type ?? null,
      sort_order: i,
    }));
    const { error: insErr } = await supabase.from("budget_items").insert(inserts);
    if (insErr) return { error: insErr.message };
  }

  // Refresh fund_types from the items list so the budget header stays in
  // sync after add/remove. Legacy fund_type stays as the single-fund value
  // (when applicable) for the per-fund levy generation path.
  const fundTypesFresh = Array.from(
    new Set(nonZero.map((i) => i.fund_type).filter((f): f is BudgetFundType => !!f)),
  );
  const { error: updErr } = await supabase
    .from("budgets")
    .update({
      total_amount: totalAmount,
      fund_types: fundTypesFresh,
      fund_type: fundTypesFresh.length === 1 ? fundTypesFresh[0] : null,
    })
    .eq("id", budgetId);
  if (updErr) return { error: updErr.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: budget.oc_id,
    action: "update",
    entity_type: "budget",
    entity_id: budgetId,
    after_state: { total_amount: totalAmount, items: nonZero.length },
  });

  revalidatePath("/ocs/[ocCode]/budgets", "page");
  return {};
}

export async function approveBudget(ocId: string, budgetId: string, note?: string) {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const approvalNote = note?.trim() || null;

  // Item 11: only ONE approved budget per (OC, financial year, fund) can
  // exist at a time. Drafts are unlimited. Before approving, check every
  // fund this budget touches against any other approved budget for the
  // same OC + FY and block if overlap.
  const { data: thisBudget } = await supabase
    .from("budgets")
    .select("id, financial_year, fund_types, fund_type, fund_id")
    .eq("id", budgetId)
    .eq("oc_id", ocId)
    .maybeSingle();
  if (!thisBudget) return { error: "Budget not found." };
  const thisFunds = new Set<string>([
    ...((thisBudget.fund_types as string[] | null) ?? []),
    ...(thisBudget.fund_type ? [thisBudget.fund_type as string] : []),
    ...(thisBudget.fund_id ? [`custom:${thisBudget.fund_id}`] : []),
  ]);
  const { data: otherApproved } = await supabase
    .from("budgets")
    .select("id, fund_types, fund_type, fund_id")
    .eq("oc_id", ocId)
    .eq("financial_year", thisBudget.financial_year)
    .eq("status", "approved")
    .neq("id", budgetId);
  for (const row of otherApproved ?? []) {
    const otherFunds = new Set<string>([
      ...((row.fund_types as string[] | null) ?? []),
      ...(row.fund_type ? [row.fund_type as string] : []),
      ...(row.fund_id ? [`custom:${row.fund_id}`] : []),
    ]);
    for (const f of thisFunds) {
      if (otherFunds.has(f)) {
        return { error: "Another approved budget already covers this fund for the selected financial year. Delete or revert it before approving this one." };
      }
    }
  }

  const { error } = await supabase
    .from("budgets")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
      approval_note: approvalNote,
    })
    .eq("id", budgetId)
    .eq("oc_id", ocId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "approve",
    entity_type: "budget",
    entity_id: budgetId,
    after_state: { approval_note: approvalNote },
  });

  revalidatePath("/ocs/[ocCode]/manage", "page");

  return { success: true };
}
