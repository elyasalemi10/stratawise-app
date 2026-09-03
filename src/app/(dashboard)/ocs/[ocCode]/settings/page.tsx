import { redirect } from "next/navigation";

// /settings has no content of its own. General is the landing section.
export default async function OCSettingsIndex({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  redirect(`/ocs/${ocCode}/settings/general`);
}
