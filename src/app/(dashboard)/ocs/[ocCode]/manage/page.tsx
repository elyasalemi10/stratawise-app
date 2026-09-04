import { notFound, redirect } from "next/navigation";

import { resolveOCFromCode } from "@/lib/oc-resolver";

// The manage page is no longer used , redirect to lots
export default async function ManageOCPage({
  params,
}: {
  params: Promise<{ ocCode: string }>;
}) {
  const { ocCode } = await params;
  const resolved = await resolveOCFromCode(ocCode);
  if (!resolved) notFound();
  redirect(`/ocs/${ocCode}/lots`);
}
