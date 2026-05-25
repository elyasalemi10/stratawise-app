import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { BudgetReport } from "@/lib/pdf/templates/budget-report";
import type { BudgetReportProps, BudgetReportItem } from "@/lib/pdf/types";
import { requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

const FUND_LABEL: Record<string, string> = {
  administrative: "Administrative Fund",
  capital_works: "Capital Works Fund",
  maintenance_plan: "Maintenance Plan Fund",
};

// Streams a one-page budget report PDF. Auth: must have OC access. The PDF
// is rendered on demand (no caching to R2) , budgets are edited often
// enough that a stale cache would mislead. Cheap enough to generate fresh.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ budgetId: string }> },
) {
  const { budgetId } = await context.params;
  const supabase = createServerClient();

  // 1. Load the budget + scope it to an OC we have access to.
  const { data: budget, error: budgetErr } = await supabase
    .from("budgets")
    .select("id, oc_id, financial_year, fund_type, total_amount, status, approved_at, approval_note")
    .eq("id", budgetId)
    .maybeSingle();
  if (budgetErr || !budget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }

  try {
    await requireOCAccess(budget.oc_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Load items + the OC + the management company for the header block.
  type RawItem = {
    description: string | null;
    amount: number;
    sort_order: number;
    budget_categories: { name: string } | null;
    chart_of_accounts: { name: string; code: string } | null;
  };
  const { data: rawItems } = await supabase
    .from("budget_items")
    .select("description, amount, sort_order, budget_categories(name), chart_of_accounts(name, code)")
    .eq("budget_id", budgetId)
    .order("sort_order");
  const items = (rawItems ?? []) as unknown as RawItem[];

  const { data: oc } = await supabase
    .from("owners_corporations")
    .select("id, name, plan_number, address, abn, management_company_id")
    .eq("id", budget.oc_id)
    .maybeSingle();
  if (!oc) {
    return NextResponse.json({ error: "OC not found" }, { status: 404 });
  }

  const { data: company } = await supabase
    .from("management_companies")
    .select("name, logo_url")
    .eq("id", oc.management_company_id)
    .maybeSingle();

  const pdfItems: BudgetReportItem[] = items.map((i) => ({
    code: i.chart_of_accounts?.code ?? null,
    name: i.chart_of_accounts?.name ?? i.budget_categories?.name ?? "Budget item",
    description: i.description,
    amount: Number(i.amount),
  }));

  const props: BudgetReportProps = {
    managementCompany: {
      name: company?.name ?? "StrataWise",
      logo_url: company?.logo_url ?? null,
    },
    oc: {
      name: oc.name,
      plan_number: oc.plan_number,
      address: oc.address,
      abn: oc.abn ?? null,
    },
    documentTitle: `Budget ${budget.financial_year}`,
    referenceNumber: `BUD-${budgetId.slice(0, 8).toUpperCase()}`,
    date: new Date(),
    financialYear: budget.financial_year,
    fundLabel: FUND_LABEL[budget.fund_type] ?? budget.fund_type,
    status: budget.status as "draft" | "approved",
    approvedAt: budget.approved_at,
    approvalNote: budget.approval_note,
    items: pdfItems,
    totalAmount: Number(budget.total_amount),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(createElement(BudgetReport, props) as any);

  const filename = `SW-BUD-${budget.financial_year}-${budget.fund_type}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
