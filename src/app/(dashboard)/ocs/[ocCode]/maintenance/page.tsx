import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { OCMaintenanceClient } from "./oc-maintenance-client";

export default async function OCMaintenancePage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  return (
    <OCMaintenanceClient
      ocId={resolved.id}
      ocCode={ocCode}
      ocName={resolved.name ?? "OC"}
    />
  );
}
