import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { requireOCAccess } from "@/lib/auth";
import { getOCNotifyOwners } from "@/lib/actions/recurring-jobs";
import { CreateMeetingForm } from "./create-meeting-form";

export default async function CreateMeetingPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  await requireOCAccess(resolved.id);

  const owners = await getOCNotifyOwners(resolved.id);

  return (
    <CreateMeetingForm
      ocId={resolved.id}
      ocCode={ocCode}
      ocName={resolved.name ?? "Owners Corporation"}
      owners={owners}
    />
  );
}
