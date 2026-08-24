"use server";

import { getCurrentProfile } from "@/lib/auth";
import { listTrustAccounts } from "@/lib/actions/trust-accounts";

export interface TrustAccountsPageData {
  accounts: Awaited<ReturnType<typeof listTrustAccounts>>;
}

export async function getTrustAccountsPageData(): Promise<TrustAccountsPageData> {
  const profile = await getCurrentProfile();
  if (!profile) throw new Error("Not authenticated.");
  if (profile.role === "lot_owner") throw new Error("Not available for lot owners.");

  return { accounts: await listTrustAccounts() };
}
