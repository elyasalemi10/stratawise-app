import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { requireOCAccess } from "@/lib/auth";
import { getRecurringJobsForOC } from "@/lib/actions/recurring-jobs";
import { getContractorOptions } from "@/lib/actions/contractors";
import { MaintenanceContent } from "../../../maintenance/maintenance-content";

export default async function OCMaintenancePage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  await requireOCAccess(resolved.id);

  const [jobs, contractors] = await Promise.all([
    getRecurringJobsForOC(resolved.id),
    getContractorOptions(),
  ]);

  return (
    <MaintenanceContent
      jobs={jobs}
      ocs={[{ id: resolved.id, name: resolved.name ?? "OC", short_code: ocCode }]}
      contractors={contractors}
      fixedOcId={resolved.id}
    />
  );
}
