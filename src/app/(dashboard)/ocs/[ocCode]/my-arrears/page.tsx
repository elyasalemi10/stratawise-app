import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { getMyArrears } from "@/lib/actions/my-arrears";
import { MyArrearsContent } from "./my-arrears-content";

export default async function MyArrearsPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");
  const ocId = resolved.id;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect(`/ocs/${ocCode}`);

  const result = await getMyArrears(ocId);
  return <MyArrearsContent rows={result.rows} outstandingTotal={result.outstandingTotal} />;
}
