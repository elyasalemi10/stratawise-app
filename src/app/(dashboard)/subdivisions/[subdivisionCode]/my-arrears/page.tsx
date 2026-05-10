import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";
import { getMyArrears } from "@/lib/actions/my-arrears";
import { MyArrearsContent } from "./my-arrears-content";

export default async function MyArrearsPage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role !== "lot_owner") redirect(`/subdivisions/${subdivisionCode}`);

  const result = await getMyArrears(subdivisionId);
  return <MyArrearsContent rows={result.rows} outstandingTotal={result.outstandingTotal} />;
}
