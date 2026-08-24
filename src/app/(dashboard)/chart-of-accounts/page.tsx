import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ChartOfAccountsClient } from "./coa-client";

// Firm-level chart of accounts , shared across every OC the management
// company runs. Per-OC budgets and trust ledgers select FROM this list rather
// than maintaining their own categories, so reports stay consistent across
// the firm.
//
// Server shell only: auth and redirects. The accounts come from the client
// through useCachedData.
export default async function ChartOfAccountsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/dashboard");
  if (!profile.management_company_id) redirect("/onboarding/setup");

  return <ChartOfAccountsClient />;
}
