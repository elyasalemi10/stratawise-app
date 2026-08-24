import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { MaintenanceClient } from "./maintenance-client";

// Server shell: auth and redirects only. Data comes from the client through
// useCachedData.
export default async function MaintenancePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/dashboard");

  return <MaintenanceClient />;
}
