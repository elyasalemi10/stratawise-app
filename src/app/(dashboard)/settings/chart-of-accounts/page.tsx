import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SectionHeader } from "@/components/shared/section-header";
import { ChartOfAccountsClient } from "./coa-client";

// Firm-level chart of accounts , shared across every OC the management
// company runs. Per-OC budgets and ledgers select FROM this list rather than
// maintaining their own categories, so reports stay consistent across the
// firm. It lives under Settings because it is configuration: you set it up
// once and touch it rarely, unlike the pages you work in daily.
//
// Server shell only: auth and redirects. The accounts come from the client
// through useCachedData.
export default async function ChartOfAccountsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/settings/profile");
  if (!profile.management_company_id) redirect("/onboarding/setup");

  return (
    <>
      <SectionHeader title="Chart of accounts" />
      <ChartOfAccountsClient />
    </>
  );
}
