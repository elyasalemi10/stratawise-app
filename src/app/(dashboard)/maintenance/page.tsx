import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getRecurringJobs, getCompanyOCsForSelect } from "@/lib/actions/recurring-jobs";
import { getContractorOptions } from "@/lib/actions/contractors";
import { MaintenanceContent } from "./maintenance-content";

export default async function MaintenancePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect("/dashboard");

  const [jobs, ocs, contractors] = await Promise.all([
    getRecurringJobs(),
    getCompanyOCsForSelect(),
    getContractorOptions(),
  ]);

  return <MaintenanceContent jobs={jobs} ocs={ocs} contractors={contractors} />;
}
