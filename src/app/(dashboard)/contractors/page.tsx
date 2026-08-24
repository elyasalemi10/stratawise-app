import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { ContractorsClient } from "./contractors-client";

// Server shell: resolves auth and redirects, fetches nothing. The data comes
// from the client through useCachedData so a return visit paints the previous
// rows instead of waiting on a server round trip.
export default async function ContractorsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/dashboard");

  return <ContractorsClient />;
}
