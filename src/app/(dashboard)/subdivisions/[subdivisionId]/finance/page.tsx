import { redirect } from "next/navigation";

// /finance redirects to /finance/budgets
export default async function FinancePage({
  params,
}: {
  params: Promise<{ subdivisionId: string }>;
}) {
  const { subdivisionId } = await params;
  redirect(`/subdivisions/${subdivisionId}/finance/budgets`);
}
