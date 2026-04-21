"use server";

import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export interface BudgetCategory {
  id: string;
  code: string;
  name: string;
  fund_type: "administrative" | "capital_works";
  sort_order: number;
}

export interface BudgetItemData {
  category_id: string;
  description: string;
  amount: number;
}

export interface BudgetWithItems {
  id: string;
  subdivision_id: string;
  financial_year: string;
  fund_type: "administrative" | "capital_works";
  total_amount: number;
  status: "draft" | "approved";
  approved_at: string | null;
  items: {
    id: string;
    category_id: string;
    category_name: string;
    description: string | null;
    amount: number;
    sort_order: number;
  }[];
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
  fundType: "administrative" | "capital_works"
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

export async function getSubdivisionBudgets(subdivisionId: string): Promise<BudgetWithItems[]> {
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: budgets } = await supabase
    .from("budgets")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("financial_year", { ascending: false });

  if (!budgets || budgets.length === 0) return [];

  const budgetIds = budgets.map((b) => b.id);
  const { data: items } = await supabase
    .from("budget_items")
    .select("id, budget_id, category_id, description, amount, sort_order, budget_categories!inner(name)")
    .in("budget_id", budgetIds)
    .order("sort_order");

  return budgets.map((b) => ({
    ...b,
    items: (items ?? [])
      .filter((i) => i.budget_id === b.id)
      .map((i) => ({
        id: i.id,
        category_id: i.category_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        category_name: (i as any).budget_categories?.name ?? "",
        description: i.description,
        amount: Number(i.amount),
        sort_order: i.sort_order,
      })),
  }));
}

export async function createBudget(
  subdivisionId: string,
  data: {
    financial_year: string;
    fund_type: "administrative" | "capital_works";
    items: BudgetItemData[];
  }
) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  // Check if budget already exists for this year + fund type
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("subdivision_id", subdivisionId)
    .eq("financial_year", data.financial_year)
    .eq("fund_type", data.fund_type)
    .single();

  if (existing) {
    return { error: `A ${data.fund_type === "administrative" ? "Administrative Fund" : "Capital Works Fund"} budget already exists for ${data.financial_year}` };
  }

  const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

  // Create budget
  const { data: budget, error } = await supabase
    .from("budgets")
    .insert({
      subdivision_id: subdivisionId,
      financial_year: data.financial_year,
      fund_type: data.fund_type,
      total_amount: totalAmount,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Create budget items
  const itemInserts = data.items
    .filter((item) => item.amount > 0)
    .map((item, i) => ({
      budget_id: budget.id,
      category_id: item.category_id,
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
    subdivision_id: subdivisionId,
    action: "create",
    entity_type: "budget",
    entity_id: budget.id,
    after_state: { financial_year: data.financial_year, fund_type: data.fund_type, total_amount: totalAmount },
  });

  revalidatePath(`/subdivisions/${subdivisionId}/manage`);

  return { success: true, budgetId: budget.id };
}

export async function approveBudget(subdivisionId: string, budgetId: string) {
  const profile = await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { error } = await supabase
    .from("budgets")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: profile.id })
    .eq("id", budgetId)
    .eq("subdivision_id", subdivisionId);

  if (error) return { error: error.message };

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: subdivisionId,
    action: "approve",
    entity_type: "budget",
    entity_id: budgetId,
  });

  revalidatePath(`/subdivisions/${subdivisionId}/manage`);

  return { success: true };
}
