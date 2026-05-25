"use server";

import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface BudgetCategory {
  id: string;
  code: string;
  name: string;
  fund_type: "administrative" | "capital_works" | "maintenance_plan";
  sort_order: number;
}

export interface BudgetItemData {
  // Either references a legacy budget_categories row (back-compat) or , for
  // new budgets , references a chart_of_accounts row via coa_account_id.
  category_id?: string | null;
  coa_account_id?: string | null;
  description: string;
  amount: number;
}

export interface BudgetWithItems {
  id: string;
  oc_id: string;
  financial_year: string;
  fund_type: "administrative" | "capital_works" | "maintenance_plan";
  total_amount: number;
  status: "draft" | "approved";
  approved_at: string | null;
  approval_note: string | null;
  items: {
    id: string;
    // Either legacy (category_id → budget_categories) or modern
    // (coa_account_id → chart_of_accounts). category_name resolves whichever
    // is present so the UI doesn't need to branch.
    category_id: string | null;
    coa_account_id: string | null;
    category_name: string;
    description: string | null;
    amount: number;
    sort_order: number;
  }[];
}

const FUND_LABEL: Record<"administrative" | "capital_works" | "maintenance_plan", string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

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
  fundType: "administrative" | "capital_works" | "maintenance_plan"
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
  const code = `${fundType === "administrative" ? "2" : "3"}99${String(sortOrder).padStart(3, "0")}`;

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
    budget_categories: { name: string } | null;
    chart_of_accounts: { name: string; code: string } | null;
  };
  const { data: rawItems } = await supabase
    .from("budget_items")
    .select(
      "id, budget_id, category_id, coa_account_id, description, amount, sort_order, " +
      "budget_categories(name), chart_of_accounts(name, code)"
    )
    .in("budget_id", budgetIds)
    .order("sort_order");
  const items = (rawItems ?? []) as unknown as RawItem[];

  return budgets.map((b) => ({
    ...b,
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
      })),
  }));
}

export async function createBudget(
  ocId: string,
  data: {
    financial_year: string;
    fund_type: "administrative" | "capital_works" | "maintenance_plan";
    items: BudgetItemData[];
  }
) {
  const profile = await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  // Check if budget already exists for this year + fund type
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("oc_id", ocId)
    .eq("financial_year", data.financial_year)
    .eq("fund_type", data.fund_type)
    .single();

  if (existing) {
    return { error: `A ${FUND_LABEL[data.fund_type]} budget already exists for ${data.financial_year}` };
  }

  const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

  // Create budget
  const { data: budget, error } = await supabase
    .from("budgets")
    .insert({
      oc_id: ocId,
      financial_year: data.financial_year,
      fund_type: data.fund_type,
      total_amount: totalAmount,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Create budget items. Prefer the new coa_account_id link; fall back to the
  // legacy category_id only when no CoA account is provided (back-compat for
  // any caller still using budget_categories).
  const itemInserts = data.items
    .filter((item) => item.amount > 0)
    .map((item, i) => ({
      budget_id: budget.id,
      category_id: item.coa_account_id ? null : (item.category_id ?? null),
      coa_account_id: item.coa_account_id ?? null,
      description: item.description || null,
      amount: item.amount,
      sort_order: i,
    }));

  if (itemInserts.length > 0) {
    const { error: itemError } = await supabase.from("budget_items").insert(itemInserts);
    if (itemError) return { error: itemError.message };
  }

  // Audit log
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "create",
    entity_type: "budget",
    entity_id: budget.id,
    after_state: { financial_year: data.financial_year, fund_type: data.fund_type, total_amount: totalAmount },
  });

  revalidatePath("/ocs/[ocCode]/manage", "page");

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
    budget_categories: { name: string } | null;
    chart_of_accounts: { name: string; code: string } | null;
  };
  const { data: rawItems } = await supabase
    .from("budget_items")
    .select(
      "id, category_id, coa_account_id, description, amount, sort_order, " +
      "budget_categories(name), chart_of_accounts(name, code)"
    )
    .eq("budget_id", budgetId)
    .order("sort_order");
  const items = (rawItems ?? []) as unknown as RawItem[];

  return {
    ...budget,
    items: items.map((i) => ({
      id: i.id,
      category_id: i.category_id,
      coa_account_id: i.coa_account_id,
      category_name: i.chart_of_accounts?.name ?? i.budget_categories?.name ?? "",
      description: i.description,
      amount: Number(i.amount),
      sort_order: i.sort_order,
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
      sort_order: i,
    }));
    const { error: insErr } = await supabase.from("budget_items").insert(inserts);
    if (insErr) return { error: insErr.message };
  }

  const { error: updErr } = await supabase
    .from("budgets")
    .update({ total_amount: totalAmount })
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
