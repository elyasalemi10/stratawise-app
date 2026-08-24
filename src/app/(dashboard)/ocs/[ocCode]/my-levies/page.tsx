import { redirect } from "next/navigation";
import { resolveOCFromCode } from "@/lib/oc-resolver";
import { getCurrentProfile } from "@/lib/auth";
import { MyLeviesClient } from "./my-levies-client";

export default async function MyLeviesPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) redirect("/dashboard");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect(`/ocs/${ocCode}`);

  return <MyLeviesClient ocId={resolved.id} />;
}
