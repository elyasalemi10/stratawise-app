import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { DashboardClient } from "../dashboard-client";

// Server shell: auth and redirect only. Both the manager and the lot-owner
// dashboards are fetched from the client through useCachedData, so a return
// visit paints from the tab cache.
export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");

  return <DashboardClient />;
}
