import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { BudgetReport } from "@/lib/pdf/templates/budget-report";
import type { BudgetReportProps, BudgetReportItem } from "@/lib/pdf/types";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { budgetId } = await context.params;
  const supabase = createServerClient();

  // 1. Load the budget + scope it to an OC we have access to.
  const { data: budget, error: budgetErr } = await supabase
    .from("budgets")
    .select("id, oc_id, financial_year, fund_type, fund_types, total_amount, status, approved_at, approval_note")
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
    fund_type: "administrative" | "capital_works" | "maintenance_plan" | null;
    budget_categories: { name: string } | null;
    chart_of_accounts: { name: string; code: string } | null;
  };
  const { data: rawItems } = await supabase
    .from("budget_items")
    .select("description, amount, sort_order, fund_type, budget_categories(name), chart_of_accounts(name, code)")
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
    .select("name, logo_url, brand_color, brand_color_secondary, address, phone, email, abn")
    .eq("id", oc.management_company_id)
    .maybeSingle();

  const pdfItems: BudgetReportItem[] = items.map((i) => ({
    code: i.chart_of_accounts?.code ?? null,
    name: i.chart_of_accounts?.name ?? i.budget_categories?.name ?? "Budget item",
    description: i.description,
    amount: Number(i.amount),
    // Fall back to the budget's legacy single fund_type when a row didn't
    // get tagged (older budgets pre-multi-fund). Lets the PDF group items
    // even when only the parent row carries fund context.
    fund_type: i.fund_type ?? (budget.fund_type as "administrative" | "capital_works" | "maintenance_plan" | null) ?? null,
  }));

  // Brand colours come from management_companies. Primary drives the
  // brand-rule + headers; secondary drives the section-icon + side accent.
  const isHex = (v: string | null | undefined): v is string =>
    !!v && /^#[0-9a-f]{3,8}$/i.test(v);
  const brandPrimary = isHex(company?.brand_color) ? company!.brand_color! : "#0E314C";
  const brandSecondary = isHex(company?.brand_color_secondary) ? company!.brand_color_secondary! : "#CFA753";

  const props: BudgetReportProps = {
    managementCompany: {
      name: company?.name ?? "StrataWise",
      logo_url: company?.logo_url ?? null,
      address: company?.address ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
      abn: company?.abn ?? null,
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
    fundLabel: (() => {
      const funds = (budget.fund_types ?? (budget.fund_type ? [budget.fund_type] : [])) as string[];
      if (funds.length === 0) return "Budget";
      return funds.map((f) => FUND_LABEL[f] ?? f).join(" + ");
    })(),
    status: budget.status as "draft" | "approved",
    approvedAt: budget.approved_at,
    approvalNote: budget.approval_note,
    items: pdfItems,
    totalAmount: Number(budget.total_amount),
    brandColors: { primary: brandPrimary, secondary: brandSecondary },
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
