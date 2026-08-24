import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { TrustAccountsClient } from "./trust-accounts-client";

// Trust accounts , firm-level. Lives on the main dashboard so a single
// manager working across multiple OCs has one entry point for the
// statutory account(s) the firm holds funds in. Per-OC ledgers stay on
// the OC pages; this surface is the bridge between bank statement and
// per-OC ledger.
//
// Shell only: auth and redirects. Data comes from the client through
// useCachedData.
export default async function TrustAccountsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/dashboard");

  return <TrustAccountsClient />;
}
