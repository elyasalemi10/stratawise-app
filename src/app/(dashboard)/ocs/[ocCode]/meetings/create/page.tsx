import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { requireOCAccess } from "@/lib/auth";
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

  return (
    <CreateMeetingForm
      ocId={resolved.id}
      ocCode={ocCode}
      ocName={resolved.name ?? "Owners Corporation"}
    />
  );
}
